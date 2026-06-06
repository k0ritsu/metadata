import { glob, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Context, ModuleMain, ModuleManifest } from './types.js';

const MODULE = 'module.json';

export async function loadModules() {
  const modules: Context['modules'] = [];

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

    let main: ModuleMain | undefined = undefined;

    if (manifest.main) {
      const path = resolve(dirent.parentPath, manifest.main);
      main = await import(path);
    }

    modules.push({
      ...manifest,
      main,
      root: dirent.parentPath
    });
  }

  return modules;
}
