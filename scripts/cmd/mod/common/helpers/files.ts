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
      const path = normalizePath(relative(root, absolute));

      if (isExcludedModulePath(path)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(absolute);

        continue;
      }

      if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await visit(root);

  return files.sort((left, right) => left.localeCompare(right));
}

function isExcludedModulePath(path: string) {
  return basename(path) === TSCONFIG_PROJECT;
}
