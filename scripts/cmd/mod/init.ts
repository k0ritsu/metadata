import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CommandHandler } from '../cmd.ts';
import { MODLOCK, MODULES } from './common/constants.ts';
import { withModuleLock } from './common/helpers/lock.ts';
import { createEmptyModlock, readModlock, writeModlock } from './common/helpers/modlock.ts';
import { writeModrc } from './common/helpers/modrc.ts';
import { exists } from './common/helpers/path.ts';

export const init: CommandHandler = withModuleLock('init', async (args) => {
  const { values } = parseArgs({
    strict: true,
    allowPositionals: false,
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
});

async function writeInitialModlock() {
  const path = resolve(MODULES, MODLOCK);
  if (await exists(path)) {
    await readModlock();

    return;
  }

  await writeModlock(createEmptyModlock());
}
