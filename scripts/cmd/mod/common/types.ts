export interface CommandHandler {
  (args: string[]): Promise<void>;
}

export interface ModuleManifest {
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  main?: string;
  dependencies?: Record<string, string>;
}

export interface Modlock {
  lockfileVersion: number;
  modules: Record<string, ModlockNode>;
}

export interface ModlockNode {
  dependencies: Record<string, string>;
  integrity?: string;
  resolved?: string;
}

export interface Modrc {
  repository: string;
}
