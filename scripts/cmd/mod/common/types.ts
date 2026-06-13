export interface ModuleManifest {
  name: string;
  description: string;
  version: string;
  main?: string;
  dependencies?: Record<string, string>;
}

export interface Modlock {
  lockfileVersion: number;
  modules: Record<string, ModlockNode>;
}

export interface ModuleMetadata {
  integrity?: string;
  resolved?: string;
}

export interface ModlockNode extends ModuleMetadata {
  dependencies: Record<string, string>;
}

export interface Modrc {
  repository: string;
}
