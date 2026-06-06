import { bootstrap } from './application.js';
import { loadConfig } from './config/config.js';
import { gracefulShutdown } from './graceful-shutdown/graceful-shutdown.js';

const config = loadConfig();

if (config.USE_PARALLELISM) {
  const { availableParallelism } = await import('node:os');
  const { createCluster } = await import('./cluster.js');

  gracefulShutdown(
    await createCluster(
      async () => ({
        shutdown: await bootstrap(config)
      }),
      {
        parallelism: availableParallelism()
      }
    )
  );
} else {
  gracefulShutdown(await bootstrap(config));
}
