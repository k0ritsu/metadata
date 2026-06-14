import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { writeOrderedJsonFile } from './common/helpers/json.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { readOrCreateModlock, writeModlock } from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { ModuleManifest } from './common/types.ts';

registerCommand({
  name: 'create',
  description: 'Create a new editable root module',
  main: withModuleTransaction('create', async (args) => {
    const { positionals } = parseArgs({
      strict: true,
      allowPositionals: true,
      args
    });

    if (positionals.length > 1) {
      throw new CmdError(
        `Unexpected argument '${positionals[1]}'. This command takes exactly one positional argument`
      );
    }

    const [name] = positionals;
    assertModuleName(name);

    const root = resolve(MODULES, name);
    if (await exists(root)) {
      throw new CmdError(`${name}: Root module already exists`);
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
      throw new CmdError(`${key}: Module already exists in lockfile`);
    }

    const node = modlock.modules[ROOT_NODE];
    if (!node) {
      throw new CmdError('Root module set is missing from lockfile');
    }

    node.dependencies[name] = manifest.version;
    modlock.modules[key] = {
      dependencies: {}
    };

    await mkdir(root, {
      recursive: true
    });

    await Promise.all([
      writeOrderedJsonFile(resolve(root, MODULE), manifest),
      writeModlock(modlock)
    ]);

    await createTsconfigs(modlock, [
      {
        root
      }
    ]);
  })
});
