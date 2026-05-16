import { AsyncLocalStorage } from 'node:async_hooks';

export function createStore() {
  const als = new AsyncLocalStorage<Record<string, unknown>>();

  return {
    run: als.run.bind(als),
    set: <T = unknown>(key: string, value: T) => {
      const store = als.getStore();
      if (store) {
        store[key] = value;
      }
    },
    get: <T = unknown>(key: string) => {
      const store = als.getStore();
      if (store) {
        return store[key] as T;
      }

      return undefined;
    }
  };
}
