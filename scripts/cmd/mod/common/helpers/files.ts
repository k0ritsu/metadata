import { readdir } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { TSCONFIG_PROJECT } from '../constants.ts';
import { normalizePath } from './path.ts';

export async function collectModuleFiles(root: string) {
  const files: string[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(absolute);

        continue;
      }

      const path = normalizePath(relative(root, absolute));
      switch (true) {
        case basename(path) === TSCONFIG_PROJECT:
          continue;
        case entry.isFile():
          files.push(path);
          continue;
      }
    }
  }

  await visit(root);

  return files.sort((left, right) => left.localeCompare(right));
}
