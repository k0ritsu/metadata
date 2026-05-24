import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODLOCK, MODRC, MODULES } from './common/constants.ts';
import {
  createEmptyModlock,
  readModlock,
  writeModlock
} from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import { isRecord } from './common/helpers/record.ts';
import type { CommandHandler, Modrc } from './common/types.ts';

export const init: CommandHandler = async (args: string[]) => {
  const { values } = parseArgs({
    strict: true,
    options: {
      repository: {
        type: 'string'
      }
    },
    args
  });

  await mkdir(MODULES, {
    recursive: true
  });
  await Promise.all([writeModrc(values.repository), writeInitialModlock()]);
};

async function writeModrc(repository?: string) {
  const path = resolve(MODULES, MODRC);
  if (await exists(path)) {
    const modrc: unknown = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assertModrc(modrc, path);

    const nextRepository = repository ?? modrc['repository'];
    assert(nextRepository, `${path}: repository is required`);

    if (modrc['repository'] === nextRepository) {
      return;
    }

    return writeFile(
      path,
      JSON.stringify(
        {
          repository: nextRepository
        } satisfies Modrc,
        undefined,
        2
      )
    );
  }

  assert(repository, 'repository is required');

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

async function writeInitialModlock() {
  const path = resolve(MODULES, MODLOCK);
  if (await exists(path)) {
    await readModlock();
    return;
  }

  await writeModlock(createEmptyModlock());
}

function assertModrc(
  value: unknown,
  path: string
): asserts value is Partial<Modrc> {
  assert(isRecord(value), `${path}: modrc must be an object`);

  const repository = value['repository'];
  assert(
    typeof repository === 'string' || typeof repository === 'undefined',
    `${path}: modrc is corrupted`
  );
}
