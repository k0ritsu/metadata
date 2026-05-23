import type { ModuleManifest } from '../types.ts';

export type Key = `${ModuleManifest['name']}@${ModuleManifest['version']}`;

export function createKey(node: Pick<ModuleManifest, 'name' | 'version'>): Key {
  return `${node.name}@${node.version}`;
}
