import { glob, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { MODULE, MODULES } from './common/constants.ts';
import { readModuleManifestFile } from './common/helpers/manifest.ts';

export async function build(_args: string[]) {
  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod = await readModuleManifestFile(path, {
      validateDependencyRanges: true
    });

    if (mod.main?.endsWith('.ts')) {
      const main = mod.main.slice(0, -3);
      mod.main = `${main}.js`;
    }

    const dist = resolve('dist', relative(resolve('src'), path));
    await mkdir(dirname(dist), {
      recursive: true
    });
    await writeFile(dist, JSON.stringify(mod, undefined, 2));
  }
}
