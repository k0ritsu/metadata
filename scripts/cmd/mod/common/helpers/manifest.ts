import assert from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import semver from 'semver';
import { MODULE, MODULE_NAME } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { isRecord } from './record.ts';

interface ModuleManifestOptions {
  validateDependencyRanges?: boolean;
}

export async function hasModuleManifest(root: string) {
  try {
    const stats = await stat(resolve(root, MODULE));

    return stats.isFile();
  } catch {
    return false;
  }
}

export async function readModuleManifest(
  root: string,
  options: ModuleManifestOptions = {}
) {
  if (basename(root) !== MODULE) {
    root = resolve(root, MODULE);
  }

  return parseModuleManifest(
    await readFile(root, {
      encoding: 'utf8'
    }),
    root,
    options
  );
}

export function parseModuleManifest(
  content: string,
  path: string,
  options: ModuleManifestOptions = {}
) {
  const mod: unknown = JSON.parse(content);
  assertModuleManifest(mod, path, options);

  return mod;
}

function assertModuleManifest(
  value: unknown,
  path: string,
  options: ModuleManifestOptions = {}
): asserts value is ModuleManifest {
  assert(isRecord(value), `${path}: manifest must be an object`);

  assert(typeof value['name'] === 'string', `${path}: name is required`);
  assertModuleName(value['name']);

  assert(typeof value['version'] === 'string', `${path}: version is required`);
  assert(
    semver.valid(value['version']) === value['version'],
    `${value['version']}: invalid module version`
  );

  if (value['dependencies'] !== undefined) {
    assertDependencies(value['dependencies'], {
      validateVersionRanges: Boolean(options.validateDependencyRanges)
    });
  }
}

export function assertModuleName(name: ModuleManifest['name']) {
  assert(MODULE_NAME.test(name), `${name}: invalid module name`);
}

export function assertDependencies(
  dependencies: unknown,
  options: {
    validateVersionRanges?: boolean;
  } = {}
) {
  assert(isRecord(dependencies), 'dependencies must be an object');

  for (const [dependency, version] of Object.entries(dependencies)) {
    assertModuleName(dependency);
    assert(
      typeof version === 'string' &&
        (options.validateVersionRanges
          ? semver.validRange(version) !== null
          : isSemver(version)),
      `${dependency}: invalid dependency version`
    );
  }
}

export function isSemver(value: string) {
  return semver.valid(value) === value;
}
