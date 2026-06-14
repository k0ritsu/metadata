import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODRC, MODULES } from '../constants.ts';
import type { Modrc } from '../types.ts';
import { writeOrderedJsonFile } from './json.ts';
import { exists } from './path.ts';
import { isRecord } from './record.ts';

class ModrcError extends Error {}

export async function resolveModrc() {
  const path = resolve(MODULES, MODRC);

  const found = await exists(path);
  if (!found) {
    return;
  }

  return path;
}

export async function readModrc() {
  const path = await resolveModrc();
  if (!path) {
    return;
  }

  const modrc: unknown = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assertModrc(modrc);

  return modrc;
}

export async function writeModrc(repository?: string) {
  const path = resolve(MODULES, MODRC);
  if (await exists(path)) {
    const modrc = await readModrc();
    if (!modrc) {
      throw new ModrcError('Repository is required');
    }

    const next = repository ?? modrc.repository;
    if (!next) {
      throw new ModrcError('Repository is required');
    }

    if (modrc['repository'] === next) {
      return;
    }

    repository = next;
  }

  if (!repository) {
    throw new ModrcError('Repository is required');
  }

  return writeOrderedJsonFile(path, {
    repository
  } satisfies Modrc);
}

export function assertModrc(value: unknown): asserts value is Modrc {
  if (!isRecord(value)) {
    throw new ModrcError('Modrc must be an object');
  }

  if (typeof value['repository'] !== 'string') {
    throw new ModrcError('Repository must be a string');
  }
}
