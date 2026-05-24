import assert from 'node:assert/strict';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CACHE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { readModlock } from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import type { CommandHandler } from './common/types.ts';
import { tidy } from './tidy.ts';

export const remove: CommandHandler = async (args: string[]) => {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  assert(positionals.length > 0, 'module name is required');

  for (const name of positionals) {
    assertModuleName(name);
  }

  const modlock = await readModlock();

  const names = new Set(positionals);
  const dependencies = modlock.modules[ROOT_NODE]?.dependencies ?? {};

  await mkdir(CACHE, {
    recursive: true
  });

  for (const name of names) {
    const version = dependencies[name];
    assert(version, `${name}: module is not installed at root level`);

    const root = resolve(MODULES, name);
    const cache = resolve(CACHE, createModuleKey(name, version));

    const rooted = await exists(root);
    const cached = await exists(cache);

    if (rooted && !cached) {
      await cp(root, cache, {
        recursive: true
      });
    }

    await rm(root, {
      force: true,
      recursive: true
    });
  }

  await tidy([]);
};
