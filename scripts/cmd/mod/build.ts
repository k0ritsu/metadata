import { glob, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { MODULE, MODULES } from './common/constants.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';

const TYPESCRIPT_EXTENSION = '.ts';
const JAVASCRIPT_EXTENSION = '.js';

export async function build(_args: string[]) {
  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    if (mod.main?.endsWith(TYPESCRIPT_EXTENSION)) {
      const main = mod.main.slice(0, -TYPESCRIPT_EXTENSION.length);
      mod.main = `${main}${JAVASCRIPT_EXTENSION}`;
    }

    const dist = resolve('dist', relative(resolve('src'), path));
    await mkdir(dirname(dist), {
      recursive: true
    });
    await writeFile(dist, JSON.stringify(mod, undefined, 2));
  }
}
