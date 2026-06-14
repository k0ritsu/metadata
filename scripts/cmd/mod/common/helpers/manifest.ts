import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import semver from 'semver';
import { MODULE, MODULE_NAME } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { exists, isInsidePath } from './path.ts';
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

  const manifest = parseModuleManifest(content, {
    context: path,
    validateDependencyRanges: Boolean(options?.validateDependencyRanges)
  });

  await assertManifestMainExists(manifest, dirname(path), {
    context: path
  });

  return manifest;
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
    throw new ManifestError(`${options.context}: Invalid module name '${name}'`);
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
    throw new ManifestError(`${options.context}: Dependencies must be an object`);
  }

  for (const [dependency, version] of Object.entries(dependencies)) {
    assertModuleName(dependency, options);

    if (typeof version === 'string') {
      if (options.validateVersionRanges ? semver.validRange(version) !== null : isSemver(version)) {
        continue;
      }
    }

    throw new ManifestError(
      `${options.context} [${dependency}]: Invalid dependency version '${version}'`
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
    throw new ManifestError(`${options.context}: Manifest must be an object`);
  }

  assertModuleName(value['name'], options);

  if (typeof value['version'] !== 'string' || !isSemver(value['version'])) {
    throw new ManifestError(`${options.context}: Invalid module version '${value['version']}'`);
  }

  if (typeof value['dependencies'] !== 'undefined') {
    assertModuleDependencies(value['dependencies'], {
      context: options.context,
      validateVersionRanges: options.validateDependencyRanges
    });
  }

  if (typeof value['main'] !== 'undefined') {
    assertModuleMain(value['main'], options);
  }
}

function assertModuleMain(
  main: unknown,
  options: {
    context: string;
  }
) {
  if (typeof main !== 'string') {
    throw new ManifestError(`${options.context}: Main must be a string`);
  }

  const extension = extname(main);
  if (extension !== '.ts' && extension !== '.js') {
    throw new ManifestError(`${options.context}: Main must be a .ts or .js path`);
  }

  if (isAbsolute(main) || !isInsidePath(resolve('.', main), resolve('.'))) {
    throw new ManifestError(`${options.context}: Main must be a safe relative path`);
  }
}

async function assertManifestMainExists(
  manifest: ModuleManifest,
  root: string,
  options: {
    context: string;
  }
) {
  if (!manifest.main) {
    return;
  }

  const main = resolve(root, manifest.main);
  if (!isInsidePath(main, root) || !(await manifestMainExists(main))) {
    throw new ManifestError(`${options.context}: Main source file does not exist`);
  }
}

async function manifestMainExists(main: string) {
  if (await exists(main)) {
    return true;
  }

  if (extname(main) !== '.js') {
    return false;
  }

  const source = `${main.slice(0, -'.js'.length)}.ts`;

  return exists(source);
}
