import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Config } from './config/types.js';
import { loadModules } from './loader/loader.js';
import { createJsonHandler, createLogger } from './logger/logger.js';
import { createRouter } from './router/router.js';
import { createServer, extractRequestInfo } from './server.js';
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
        requestId = randomUUID();
      }

      logger.info(
        `Incoming request ${req.method} ${req.url}`,
        'requestId',
        requestId,
        ...extractRequestInfo(req)
      );

      return store.run(
        {
          requestId
        },
        () => router.lookup(req, res, ctx, done)
      );
    },
    {
      version: config.HTTP_VERSION,
      tls: await loadTlsConfig(config),
      port: config.HTTP_PORT
    }
  );

  logger.info(`Starting ${config.APP_NAME}@${config.APP_VERSION} on port ${config.HTTP_PORT}`);

  const modules = await loadModules();
  const hooks = await Promise.all(
    modules.map((module) => {
      logger.info(`Registering module ${module.name}@${module.version}`);

      if (!module.main) {
        return;
      }

      let hook: ReturnType<NonNullable<typeof module.main>['register']> | undefined;

      router.group('', (router) => {
        hook = module.main?.register({
          router,
          logger,
          modules,
          store
        });
      });

      return hook;
    })
  );

  return async () => {
    const resolver = Promise.withResolvers<void>();

    server.close(() => {
      resolver.resolve();
    });

    await Promise.all([resolver.promise, ...hooks.map(({ shutdown } = {}) => shutdown?.())]);
  };
}

async function loadTlsConfig(config: Config) {
  switch (true) {
    case typeof config.TLS_CERT_PATH === 'undefined' && typeof config.TLS_KEY_PATH === 'undefined':
      return;
    case typeof config.TLS_CERT_PATH !== 'undefined' && typeof config.TLS_KEY_PATH !== 'undefined':
      return {
        cert: await readFile(config.TLS_CERT_PATH, 'utf8'),
        key: await readFile(config.TLS_KEY_PATH, 'utf8')
      };
    default:
      throw new Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
  }
}
