import { access, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isRecord } from './record.ts';

const STAGING_PREFIX = '.mod-tmp-';
const BACKUP_PREFIX = '.mod-backup-';

export function isInsidePath(path: string, root: string) {
  const relativePath = relative(root, path);

  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

export function normalizePath(path: string) {
  return sep === '/' ? path : path.replaceAll(sep, '/');
}

export async function exists(path: string) {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

export async function createTemporarySibling(path: string) {
  const parent = dirname(path);
  await mkdir(parent, {
    recursive: true
  });

  await cleanTemporarySiblings(path);

  return mkdtemp(resolve(parent, `${STAGING_PREFIX}${basename(path)}-`));
}

export async function replacePathAtomically(target: string, replacement: string) {
  const backup = await moveExistingPathToBackup(target);
  let replacementMoved = false;

  try {
    await rename(replacement, target);
    replacementMoved = true;

    if (backup) {
      await rm(backup, {
        force: true,
        recursive: true
      });
    }
  } catch (error) {
    if (backup) {
      await rm(target, {
        force: true,
        recursive: true
      });
      await rename(backup, target);
    }

    if (!replacementMoved) {
      await rm(replacement, {
        force: true,
        recursive: true
      });
    }

    throw error;
  }
}

async function cleanTemporarySiblings(path: string) {
  const parent = dirname(path);

  let entries;
  try {
    entries = await readdir(parent, {
      withFileTypes: true
    });
  } catch {
    return;
  }

  const prefix = `${STAGING_PREFIX}${basename(path)}-`;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .map((entry) => {
        return rm(resolve(parent, entry.name), {
          force: true,
          recursive: true
        });
      })
  );
}

async function moveExistingPathToBackup(path: string) {
  const backup = resolve(
    dirname(path),
    `${BACKUP_PREFIX}${basename(path)}-${process.pid}-${Date.now()}`
  );

  try {
    await rename(path, backup);

    return backup;
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown) {
  return isRecord(error) && error['code'] === 'ENOENT';
}
