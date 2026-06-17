import { AsyncLocalStorage } from 'node:async_hooks';

export type Store = ReturnType<typeof createStore>;

export function createStore() {
  const als = new AsyncLocalStorage<Record<string, unknown>>();

  return {
    run: als.run.bind(als),
    set<T = unknown>(key: string, value: T) {
      const store = als.getStore();
      if (!store) {
        return;
      }

      store[key] = value;
    },
    get<T = unknown>(key: string) {
      const store = als.getStore();
      if (!store) {
        return;
      }

      return store[key] as T;
    }
  };
}
