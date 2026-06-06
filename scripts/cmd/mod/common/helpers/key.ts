interface Key {
  dependency: string;
  version: string;
}

export function createModuleKey(dependency: string, version: string): string {
  return `${dependency}@${version}`;
}

export function parseModuleKey(key: string): Key {
  const index = key.lastIndexOf('@');
  if (index > 0 && index < key.length - 1) {
    return {
      dependency: key.slice(0, index),
      version: key.slice(index + 1)
    };
  }

  throw new Error(`${key}: invalid module key`);
}
