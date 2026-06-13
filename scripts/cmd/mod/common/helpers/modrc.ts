import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODRC, MODULES } from '../constants.ts';
import type { Modrc } from '../types.ts';
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

export async function writeModrc(repository?: string) {
  const path = resolve(MODULES, MODRC);
  if (await exists(path)) {
    const modrc: unknown = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assertModrc(modrc);

    const next = repository ?? modrc['repository'];
    if (!next) {
      throw new ModrcError('repository is required');
    }

    if (modrc['repository'] === next) {
      return;
    }

    repository = next;
  }

  if (!repository) {
    throw new ModrcError('repository is required');
  }

  return writeFile(
    path,
    JSON.stringify(
      {
        repository
      } satisfies Modrc,
      undefined,
      2
    )
  );
}

export function assertModrc(value: unknown): asserts value is Modrc {
  if (!isRecord(value)) {
    throw new ModrcError('modrc must be an object');
  }

  if (typeof value['repository'] !== 'string') {
    throw new ModrcError('repository must be a string');
  }
}
