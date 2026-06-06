import type { Logger } from '../logger/types.js';
import type { Router } from '../router/types.js';
import type { Store } from '../store/types.js';

export interface Context {
  router: Router;
  logger: Logger;
  modules: Array<
    Omit<ModuleManifest, 'main'> & {
      main?: ModuleMain | undefined;
      root: string;
    }
  >;
  store: Store;
}

export interface ModuleManifest {
  name: string;
  description: string;
  version: string;
  main?: string;
  dependencies?: Record<string, string>;
}

export interface ModuleMain {
  register(context: Context): Promise<{
    shutdown?(): Promise<void>;
  }>;
}
