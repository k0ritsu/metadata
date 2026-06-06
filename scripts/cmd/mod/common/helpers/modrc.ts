import assert from 'node:assert';
import { resolve } from 'node:path';
import { MODRC, MODULES } from '../constants.ts';
import type { Modrc } from '../types.ts';
import { exists } from './path.ts';
import { isRecord } from './record.ts';

export async function resolveModrc() {
  const path = resolve(MODULES, MODRC);

  const found = await exists(path);
  if (!found) {
    return;
  }

  return path;
}

export function assertModrc(
  value: unknown,
  path: string
): asserts value is Modrc {
  assert(isRecord(value), `${path}: modrc must be an object`);
  assert(
    typeof value['repository'] === 'string',
    `${path}: repository must be a string`
  );
}
