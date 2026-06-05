import cluster from 'node:cluster';
import process from 'node:process';

interface Config {
  parallelism: number;
}

export async function createCluster(
  createWorker: () => Promise<{
    shutdown(): Promise<void>;
  }>,
  config: Config
) {
  if (cluster.isPrimary) {
    for (let i = 0; i < config.parallelism; i++) {
      cluster.fork(process.env);
    }

    cluster.on('exit', (worker) => {
      if (!worker.exitedAfterDisconnect) {
        cluster.fork(process.env);
      }
    });

    return async () => {
      if (cluster.workers) {
        await Promise.all(
          Object.values(cluster.workers).map((worker) => {
            return new Promise<void>((resolve) => {
              if (!worker || worker.isDead()) {
                resolve();
              } else {
                worker.once('exit', resolve);
                worker.disconnect();
              }
            });
          })
        );
      }
    };
  } else {
    const { shutdown } = await createWorker();

    process.on('disconnect', async () => {
      await shutdown();

      process.exit(0);
    });

    return;
  }
}
