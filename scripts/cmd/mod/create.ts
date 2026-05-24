import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODLOCK, MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import {
  createEmptyModlock,
  readModlock,
  writeModlock
} from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { CommandHandler, ModuleManifest } from './common/types.ts';

export const create: CommandHandler = async (args: string[]) => {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  const [name] = positionals;
  assert(name, 'module name is required');

  assertModuleName(name);

  const root = resolve(MODULES, name);

  const rooted = await exists(root);
  assert(!rooted, `${name}: root module already exists`);

  const manifest = {
    name,
    description: '',
    version: '0.1.0',
    dependencies: {}
  } satisfies ModuleManifest;

  const modlock = await readOrCreateModlock();

  const key = createModuleKey(manifest.name, manifest.version);
  assert(!modlock.modules[key], `${key}: module already exists in lockfile`);

  const node = modlock.modules[ROOT_NODE];
  assert(node, 'root module set is missing from lockfile');

  node.dependencies[name] = manifest.version;
  modlock.modules[key] = {
    dependencies: {}
  };

  await mkdir(root, {
    recursive: true
  });
  await Promise.all([
    writeFile(resolve(root, MODULE), JSON.stringify(manifest, undefined, 2)),
    writeModlock(modlock)
  ]);

  await createTsconfigs([
    {
      root,
      name
    }
  ]);
};

async function readOrCreateModlock() {
  if (await exists(resolve(MODULES, MODLOCK))) {
    return await readModlock();
  }

  return createEmptyModlock();
}
