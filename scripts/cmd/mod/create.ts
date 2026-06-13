import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CmdError, type CommandHandler } from '../cmd.ts';
import { MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { withModuleLock } from './common/helpers/lock.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { readOrCreateModlock, writeModlock } from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { ModuleManifest } from './common/types.ts';

export const create: CommandHandler = withModuleLock('create', async (args) => {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  const [name] = positionals;
  assertModuleName(name);

  const root = resolve(MODULES, name);

  if (await exists(root)) {
    throw new CmdError(`${name}: root module already exists`);
  }

  const manifest = {
    name,
    description: '',
    version: '0.1.0',
    dependencies: {}
  } satisfies ModuleManifest;

  const modlock = await readOrCreateModlock();

  const key = createModuleKey(manifest.name, manifest.version);
  if (modlock.modules[key]) {
    throw new CmdError(`${key}: module already exists in lockfile`);
  }

  const node = modlock.modules[ROOT_NODE];
  if (!node) {
    throw new CmdError('root module set is missing from lockfile');
  }

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
      root
    }
  ]);
});
