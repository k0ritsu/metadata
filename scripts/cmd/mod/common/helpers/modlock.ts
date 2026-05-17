import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import semver from 'semver';
import { MODLOCK, MODULES } from '../constants.ts';
import type { Modlock } from '../types.ts';
import { assertModuleName } from './manifest.ts';
import { isRecord } from './record.ts';

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

export function assertModlock(
  value: unknown,
  path: string
): asserts value is Modlock {
  assert(isRecord(value), `${path}: modlock must be an object`);

  for (const [name, node] of Object.entries(value)) {
    assertLockNode(node);
    assert(
      node.name === name,
      `${path}: lock key "${name}" must match node name`
    );
  }
}

export function assertLockNode(
  value: unknown
): asserts value is Modlock[string] {
  assert(isRecord(value), 'invalid modlock node');

  const name = value['name'];
  assert(typeof name === 'string', 'lock node name is required');
  assertModuleName(name);

  const version = value['version'];
  assert(typeof version === 'string', `${name}: lock node version is required`);
  assert(
    semver.valid(version) === version,
    `${name}@${version}: invalid locked version`
  );

  const dependencies = value['dependencies'];
  assert(
    isRecord(dependencies),
    `${name}: lock node dependencies must be an object`
  );

  for (const [dependencyName, dependency] of Object.entries(dependencies)) {
    assertLockNode(dependency);
    assert(
      dependency.name === dependencyName,
      `${name}: lock dependency key "${dependencyName}" must match node name`
    );
  }
}
