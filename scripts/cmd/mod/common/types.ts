export interface ModManifest {
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  main?: string;
  dependencies?: {
    [mod: ModManifest['name']]: ModManifest['version'];
  };
}

export interface Modlock {
  [mod: ModManifest['name']]: {
    dependencies: Modlock;
    name: ModManifest['name'];
    version: ModManifest['version'];
  };
}

export type ModlockNode = Modlock[string];

export interface Modrc {
  repository: string;
}
