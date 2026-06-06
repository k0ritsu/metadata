import { access } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';

export function isInsidePath(path: string, root: string): boolean {
  const relativePath = relative(root, path);

  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  );
}

export function normalizePath(path: string): string {
  return sep === '/' ? path : path.replaceAll(sep, '/');
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}
