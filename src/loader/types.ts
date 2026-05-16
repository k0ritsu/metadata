import type { Logger } from '../logger/types.js';
import type { Router } from '../router/types.js';
import type { Store } from '../store/types.js';

export interface Ctx {
  router: Router;
  logger: Logger;
  modules: Array<
    Omit<Mod, 'main'> & {
      main: ModMain;
    }
  >;
  store: Store;
}

export interface Mod {
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  main?: string;
}

export interface ModMain {
  register(ctx: Ctx): Promise<{
    shutdown?(): Promise<void>;
  }>;
}
