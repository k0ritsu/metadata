import assert from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODULE, MODULES } from './common/constants.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { ModuleManifest } from './common/types.ts';

export async function create(args: string[]) {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  assert(positionals.length === 1, 'module name is required');

  const [name = ''] = positionals;
  assertModuleName(name);

  const root = resolve(MODULES, name);
  const mod = {
    name,
    description: '',
    version: '0.1.0',
    dependencies: {}
  } satisfies ModuleManifest;

  await mkdir(root);
  await writeFile(resolve(root, MODULE), JSON.stringify(mod, undefined, 2));
  await createTsconfigs([
    {
      root,
      name
    }
  ]);
}
