export interface ModuleManifest {
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  main?: string;
  dependencies?: Record<ModuleManifest['name'], ModuleManifest['version']>;
}

export interface Modlock extends Record<
  ModuleManifest['name'],
  {
    dependencies: Modlock;
    name: ModuleManifest['name'];
    version: ModuleManifest['version'];
  }
> {}

export type ModlockNode = Modlock[ModuleManifest['name']];

export interface Modrc {
  repository: string;
}
