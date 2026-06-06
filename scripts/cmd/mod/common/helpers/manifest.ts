import assert from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import semver from 'semver';
import { MODULE, MODULE_NAME } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { isRecord } from './record.ts';

interface ModuleManifestOptions {
  validateDependencyRanges: boolean;
}

export async function hasModuleManifest(root: string) {
  if (basename(root) !== MODULE) {
    root = resolve(root, MODULE);
  }

  try {
    const stats = await stat(resolve(root, MODULE));

    return stats.isFile();
  } catch {
    return false;
  }
}

export async function readModuleManifest(
  path: string,
  options?: ModuleManifestOptions
) {
  if (basename(path) !== MODULE) {
    path = resolve(path, MODULE);
  }

  return parseModuleManifest(
    await readFile(path, {
      encoding: 'utf8'
    }),
    path,
    options
  );
}

export function parseModuleManifest(
  content: string,
  path: string,
  options?: ModuleManifestOptions
) {
  const manifest: unknown = JSON.parse(content);
  assertModuleManifest(manifest, path, options);

  return manifest;
}

function assertModuleManifest(
  value: unknown,
  path: string,
  options = {
    validateDependencyRanges: false
  }
): asserts value is ModuleManifest {
  assert(isRecord(value), `${path}: manifest must be an object`);

  assert(typeof value['name'] === 'string', `${path}: name is required`);
  assertModuleName(value['name']);

  assert(typeof value['version'] === 'string', `${path}: version is required`);
  assert(
    isSemver(value['version']),
    `${value['version']}: invalid module version`
  );

  if (value['dependencies'] !== undefined) {
    assertDependencies(value['dependencies'], {
      validateVersionRanges: options.validateDependencyRanges
    });
  }
}

export function assertModuleName(name: string) {
  assert(MODULE_NAME.test(name), `${name}: invalid module name`);
}

function assertDependencies(
  dependencies: unknown,
  options = {
    validateVersionRanges: false
  }
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
