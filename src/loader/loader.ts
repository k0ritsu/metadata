import { glob, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ModuleMain, ModuleManifest } from './types.js';

const MODULE = 'module.json';

export async function loadModules() {
  const modules: Array<
    Omit<ModuleManifest, 'main'> & {
      main: ModuleMain;
    }
  > = [];

  const entry = process.argv[1];
  if (!entry) {
    return modules;
  }

  for await (const dirent of glob(
    resolve(dirname(entry), 'modules', '*', MODULE),
    {
      withFileTypes: true
    }
  )) {
    const manifest: ModuleManifest = JSON.parse(
      await readFile(resolve(dirent.parentPath, dirent.name), {
        encoding: 'utf8'
      })
    );

    if (manifest.enabled && manifest.main) {
      const path = resolve(dirent.parentPath, manifest.main);
      const main: ModuleMain = await import(path);

      modules.push({
        ...manifest,
        main
      });
    }
  }

  return modules;
}
