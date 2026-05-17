import type { ModManifest } from '../types.ts';

export type Key = `${ModManifest['name']}@${ModManifest['version']}`;

export function createKey(node: Pick<ModManifest, 'name' | 'version'>): Key {
  return `${node.name}@${node.version}`;
}
