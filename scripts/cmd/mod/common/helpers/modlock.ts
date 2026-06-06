import assert from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CACHE, MODLOCK, MODULES, ROOT_NODE } from '../constants.ts';
import type { Modlock, ModlockNode } from '../types.ts';
import { parseModuleKey } from './key.ts';
import { assertModuleName, isSemver } from './manifest.ts';
import { isRecord } from './record.ts';

const LOCKFILE_VERSION = 1;

export function createEmptyModlock(): Modlock {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    modules: {
      [ROOT_NODE]: {
        dependencies: {}
      }
    }
  };
}

export async function readModlock() {
  const path = resolve(MODULES, MODLOCK);

  const modlock: unknown = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assertModlock(modlock, path);

  return modlock;
}

export async function writeModlock(modlock: Modlock) {
  assertModlock(modlock, MODLOCK);

  await writeFile(
    resolve(MODULES, MODLOCK),
    JSON.stringify(modlock, undefined, 2)
  );
}

export function resolveModuleRoot(key: string, modlock: Modlock) {
  const { dependency, version } = parseModuleKey(key);

  return isRootDependency(dependency, version, modlock)
    ? resolve(MODULES, dependency)
    : resolve(CACHE, key);
}

function isRootDependency(
  dependency: string,
  version: string,
  modlock: Modlock
) {
  return modlock.modules[ROOT_NODE]?.dependencies[dependency] === version;
}

function assertModlock(value: unknown, path: string): asserts value is Modlock {
  assert(isRecord(value), `${path}: modlock must be an object`);

  const lockfileVersion = value['lockfileVersion'];
  assert(
    lockfileVersion === LOCKFILE_VERSION,
    `${path}: unsupported lockfile version ${lockfileVersion}`
  );

  const modules = value['modules'];
  assert(isRecord(modules), `${path}: modules must be an object`);

  for (const [key, node] of Object.entries(modules)) {
    assertModlockNode(node, {
      context: `${path} [${key || 'root module set'}]`,
      assertIntegrity: true,
      assertResolved: true
    });

    if (key === ROOT_NODE) {
      continue;
    }

    const { dependency, version } = parseModuleKey(key);
    assertModuleName(dependency);
    assert(isSemver(version), `${path}: ${key}: invalid locked version`);
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
  assert(isRecord(value), options.context);

  const dependencies = value['dependencies'];
  assert(
    isRecord(dependencies),
    `${options.context}: dependencies must be an object`
  );

  for (const [dependency, version] of Object.entries(dependencies)) {
    assertModuleName(dependency);
    assert(
      typeof version === 'string' && isSemver(version),
      `${options.context}: invalid ${dependency} version`
    );
  }

  if (options.assertIntegrity) {
    const integrity = value['integrity'];
    assert(
      integrity === undefined || typeof integrity === 'string',
      `${options.context}: integrity must be a string`
    );
  }

  if (options.assertResolved) {
    const resolved = value['resolved'];
    assert(
      resolved === undefined || typeof resolved === 'string',
      `${options.context}: resolved must be a string`
    );
  }
}
