import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import semver from 'semver';
import { MODULE, MODULE_NAME } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { isRecord } from './record.ts';

interface ModuleManifestOptions {
  validateDependencyRanges: boolean;
}

export async function readModuleManifest(
  path: string,
  options?: ModuleManifestOptions
): Promise<ModuleManifest> {
  if (basename(path) !== MODULE) {
    path = resolve(path, MODULE);
  }

  const content = await readFile(path, {
    encoding: 'utf8'
  });

  return parseModuleManifest(content, path, options);
}

export function parseModuleManifest(
  content: string,
  path: string,
  options?: ModuleManifestOptions
): ModuleManifest {
  const manifest: unknown = JSON.parse(content);
  assertModuleManifest(manifest, path, options);

  return manifest;
}

export function assertModuleName(name: string): void {
  assert(MODULE_NAME.test(name), `${name}: invalid module name`);
}

export function isSemver(value: string): boolean {
  return semver.valid(value) === value;
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

function assertDependencies(
  dependencies: unknown,
  options = {
    validateVersionRanges: false
  }
): void {
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
