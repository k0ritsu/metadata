import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CACHE, MODLOCK, MODULES, ROOT_NODE } from '../constants.ts';
import type { Modlock, ModlockNode, ModuleMetadata } from '../types.ts';
import { parseModuleKey } from './key.ts';
import { writeJsonFile } from './json.ts';
import { assertModuleDependencies, assertModuleName, isSemver } from './manifest.ts';
import { exists } from './path.ts';
import { isRecord } from './record.ts';

const LOCKFILE_VERSION = 1;

class ModlockError extends Error {}

export function createEmptyModlock() {
  const modlock: Modlock = {
    lockfileVersion: LOCKFILE_VERSION,
    modules: {
      [ROOT_NODE]: {
        dependencies: {}
      }
    }
  };

  return modlock;
}

export async function readModlock() {
  const path = resolve(MODULES, MODLOCK);

  const modlock: unknown = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assertModlock(modlock);

  return modlock;
}

export async function readOrCreateModlock() {
  if (await exists(resolve(MODULES, MODLOCK))) {
    return readModlock();
  }

  return createEmptyModlock();
}

export async function writeModlock(modlock: Modlock) {
  assertModlock(modlock);

  await writeJsonFile(resolve(MODULES, MODLOCK), sortModlock(modlock));
}

export function resolveModuleRoot(key: string, modlock: Modlock) {
  const { dependency, version } = parseModuleKey(key);

  return isRootDependency(dependency, version, modlock)
    ? resolve(MODULES, dependency)
    : resolve(CACHE, key);
}

export function copyModuleMetadata(node?: ModlockNode) {
  const metadata: ModuleMetadata = {};

  if (typeof node?.integrity !== 'undefined') {
    metadata.integrity = node.integrity;
  }

  if (typeof node?.resolved !== 'undefined') {
    metadata.resolved = node.resolved;
  }

  return metadata;
}

export function haveSameDependencyGraph(left: Modlock, right: Modlock) {
  return (
    JSON.stringify(createDependencyGraph(left)) === JSON.stringify(createDependencyGraph(right))
  );
}

function isRootDependency(dependency: string, version: string, modlock: Modlock) {
  return modlock.modules[ROOT_NODE]?.dependencies[dependency] === version;
}

function sortModlock(modlock: Modlock) {
  return {
    lockfileVersion: modlock.lockfileVersion,
    modules: sortEntries(
      Object.entries(modlock.modules).map(([key, node]) => [key, sortModlockNode(node)])
    )
  } satisfies Modlock;
}

function sortModlockNode(node: ModlockNode) {
  return {
    dependencies: sortRecord(node.dependencies),
    ...copyModuleMetadata(node)
  } satisfies ModlockNode;
}

function createDependencyGraph(modlock: Modlock) {
  return sortEntries(
    Object.entries(modlock.modules).map(([key, node]) => [key, sortRecord(node.dependencies)])
  );
}

function sortRecord<T>(record: Record<string, T>) {
  return sortEntries(Object.entries(record));
}

function sortEntries<T>(entries: Array<[string, T]>) {
  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}

function assertModlock(value: unknown): asserts value is Modlock {
  if (!isRecord(value)) {
    throw new ModlockError('Modlock must be an object');
  }

  const lockfileVersion = value['lockfileVersion'];
  if (lockfileVersion !== LOCKFILE_VERSION) {
    throw new ModlockError(`Unsupported lockfile version ${lockfileVersion}`);
  }

  const modules = value['modules'];
  if (!isRecord(modules)) {
    throw new ModlockError('Modules must be an object');
  }

  for (const [key, node] of Object.entries(modules)) {
    if (key !== ROOT_NODE) {
      const { dependency, version } = parseModuleKey(key);
      assertModuleName(dependency);

      if (!isSemver(version)) {
        throw new ModlockError(`${key}: Invalid locked version '${version}'`);
      }
    }

    assertModlockNode(node, {
      context: key || 'root module set',
      assertIntegrity: true,
      assertResolved: true
    });
  }
}

function assertModlockNode(
  value: unknown,
  options = {
    context: 'invalid modlock node',
    assertIntegrity: false,
    assertResolved: false
  }
): asserts value is ModlockNode {
  if (!isRecord(value)) {
    throw new ModlockError(`${options.context}: Dependencies must be an object`);
  }

  assertModuleDependencies(value['dependencies'], {
    context: options.context,
    validateVersionRanges: false
  });

  if (options.assertIntegrity) {
    const integrity = typeof value['integrity'];

    if (integrity !== 'undefined' && integrity !== 'string') {
      throw new ModlockError(`${options.context}: Integrity must be a string`);
    }
  }

  if (options.assertResolved) {
    const resolved = typeof value['resolved'];

    if (resolved !== 'undefined' && resolved !== 'string') {
      throw new ModlockError(`${options.context}: Resolved must be a string`);
    }
  }
}
