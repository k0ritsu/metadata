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
import { assertModrc } from './common/helpers/modrc.ts';
import { exists } from './common/helpers/path.ts';
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

async function writeModrc(repository?: string): Promise<void> {
  const path = resolve(MODULES, MODRC);
  if (await exists(path)) {
    const modrc: unknown = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assertModrc(modrc, path);

    const next = repository ?? modrc['repository'];
    assert(next, `${path}: repository is required`);

    if (modrc['repository'] === next) {
      return;
    }

    repository = next;
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

async function writeInitialModlock(): Promise<void> {
  const path = resolve(MODULES, MODLOCK);
  if (await exists(path)) {
    await readModlock();

    return;
  }

  await writeModlock(createEmptyModlock());
}
