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
  modules: Record<
    string,
    {
      dependencies: Record<string, string>;
      integrity?: string;
      resolved?: string;
    }
  >;
}

export type ModlockNode = Modlock['modules'][string];

export interface Modrc {
  repository: string;
}
