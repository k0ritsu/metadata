import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectModuleFiles } from './files.ts';

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
  const files = await collectModuleFiles(root);

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

function normalizeMode(mode: number) {
  return mode & 0o111 ? '755' : '644';
}
