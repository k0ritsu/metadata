import { access } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';

export function isInsidePath(path: string, root: string) {
  const relativePath = relative(root, path);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
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
