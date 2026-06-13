import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import semver from 'semver';
import { MODULE, MODULE_NAME } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { isRecord } from './record.ts';

class ManifestError extends Error {}

export async function readModuleManifest(
  path: string,
  options?: {
    validateDependencyRanges: boolean;
  }
) {
  if (basename(path) !== MODULE) {
    path = resolve(path, MODULE);
  }

  const content = await readFile(path, {
    encoding: 'utf8'
  });

  return parseModuleManifest(content, {
    context: path,
    validateDependencyRanges: Boolean(options?.validateDependencyRanges)
  });
}

export function parseModuleManifest(
  content: string,
  options = {
    context: 'invalid module manifest',
    validateDependencyRanges: false
  }
) {
  const manifest: unknown = JSON.parse(content);
  assertModuleManifest(manifest, options);

  return manifest;
}

export function assertModuleName(
  name: unknown,
  options = {
    context: name
  }
): asserts name is string {
  if (typeof name !== 'string' || !MODULE_NAME.test(name)) {
    throw new ManifestError(`${options.context}: invalid module name "${name}"`);
  }
}

export function assertModuleDependencies(
  dependencies: unknown,
  options = {
    context: 'invalid module dependencies',
    validateVersionRanges: false
  }
) {
  if (!isRecord(dependencies)) {
    throw new ManifestError(`${options.context}: dependencies must be an object`);
  }

  for (const [dependency, version] of Object.entries(dependencies)) {
    assertModuleName(dependency, options);

    if (typeof version === 'string') {
      if (options.validateVersionRanges ? semver.validRange(version) !== null : isSemver(version)) {
        continue;
      }
    }

    throw new ManifestError(
      `${options.context} [${dependency}]: invalid dependency version "${version}"`
    );
  }
}

export function isSemver(value: string) {
  return semver.valid(value) === value;
}

function assertModuleManifest(
  value: unknown,
  options: {
    context: string;
    validateDependencyRanges: boolean;
  }
): asserts value is ModuleManifest {
  if (!isRecord(value)) {
    throw new ManifestError(`${options.context}: manifest must be an object`);
  }

  assertModuleName(value['name'], options);

  if (typeof value['version'] !== 'string' || !isSemver(value['version'])) {
    throw new ManifestError(`${options.context}: invalid module version "${value['version']}"`);
  }

  if (typeof value['dependencies'] !== 'undefined') {
    assertModuleDependencies(value['dependencies'], {
      context: options.context,
      validateVersionRanges: options.validateDependencyRanges
    });
  }
}
