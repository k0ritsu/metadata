// @ts-expect-error Added in Node.js, pending @types/node support (expected in 24.16)
import { randomUUIDv7 } from 'node:crypto';
import type { Config } from './config/types.js';
import { loadModules } from './loader/loader.js';
import { createJsonHandler, createLogger } from './logger/logger.js';
import { createRouter } from './router/router.js';
import { createServer } from './server.js';
import { createStore } from './store/store.js';

export async function bootstrap(config: Config) {
  const logger = createLogger(
    createJsonHandler({
      level: config.LOG_LEVEL
    })
  );

  const store = createStore();

  const router = createRouter(config, logger);
  const server = await createServer(
    (req, res, ctx, done) => {
      let requestId = req.headers['x-request-id'];
      if (typeof requestId !== 'string') {
        requestId = randomUUIDv7();
      }

      return store.run(
        {
          requestId
        },
        () => router.lookup(req, res, ctx, done)
      );
    },
    {
      port: config.HTTP_PORT
    }
  );

  logger.info(
    `Starting ${config.APP_NAME}@${config.APP_VERSION} on port ${config.HTTP_PORT}`
  );

  const modules = await loadModules();
  const hooks = await Promise.all(
    modules.map((module) => {
      logger.info(`Registering module ${module.name}@${module.version}`);

      return module.main.register({
        router,
        logger,
        modules,
        store
      });
    })
  );

  return async () => {
    const resolver = Promise.withResolvers<void>();

    server.close(() => {
      resolver.resolve();
    });

    await Promise.all([
      resolver.promise,
      ...hooks.map(({ shutdown } = {}) => shutdown?.())
    ]);
  };
}
