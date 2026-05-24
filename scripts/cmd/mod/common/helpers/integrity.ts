import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { normalizePath } from './path.ts';
import { TSCONFIG_PROJECT } from './tsconfig.ts';

interface IntegrityEntry {
  content: Buffer;
  mode: number;
  path: string;
}

export async function createModuleIntegrity(root: string) {
  const hash = createHash('sha512');

  const entries = await collectIntegrityEntries(root);
  for (const entry of entries) {
    hash.update(entry.path);
    hash.update('\0');
    hash.update(normalizeMode(entry.mode));
    hash.update('\0');
    hash.update(String(entry.content.length));
    hash.update('\0');
    hash.update(entry.content);
    hash.update('\0');
  }

  return `sha512-${hash.digest('base64')}`;
}

async function collectIntegrityEntries(root: string) {
  const files = await collectIntegrityFiles(root);

  return Promise.all(
    files.map(async (path): Promise<IntegrityEntry> => {
      const absolute = resolve(root, path);
      const [content, stats] = await Promise.all([
        readFile(absolute),
        stat(absolute)
      ]);

      return {
        content,
        mode: stats.mode,
        path
      };
    })
  );
}

async function collectIntegrityFiles(root: string) {
  const files: string[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const path = normalizePath(relative(root, absolute));

      if (isExcludedIntegrityPath(path)) {
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

function isExcludedIntegrityPath(path: string) {
  return basename(path) === TSCONFIG_PROJECT;
}

function normalizeMode(mode: number) {
  return mode & 0o111 ? '755' : '644';
}
