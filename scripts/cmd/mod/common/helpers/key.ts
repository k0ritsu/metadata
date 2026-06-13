const sep = '@';

export function createModuleKey(dependency: string, version: string) {
  return `${dependency}${sep}${version}`;
}

export function parseModuleKey(key: string) {
  const index = key.indexOf(sep);
  if (index > 0 && index < key.length - 1) {
    return {
      dependency: key.slice(0, index),
      version: key.slice(index + 1)
    };
  }

  throw new Error(`${key}: invalid module key`);
}
