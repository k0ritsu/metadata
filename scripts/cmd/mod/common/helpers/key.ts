export function createModuleKey(dependency: string, version: string) {
  return `${dependency}@${version}`;
}

export function parseModuleKey(key: string) {
  const index = key.lastIndexOf('@');
  if (index <= 0 || index === key.length - 1) {
    throw new Error(`${key}: invalid module key`);
  }

  return {
    dependency: key.slice(0, index),
    version: key.slice(index + 1)
  };
}
