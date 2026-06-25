import cluster, { type Worker } from 'node:cluster';
import process from 'node:process';
import type { Shutdown } from './graceful-shutdown/types.js';

interface CreateWorker {
  (): Promise<{
    shutdown: Shutdown;
  }>;
}

interface Config {
  parallelism: number;
}

export async function createCluster(createWorker: CreateWorker, config: Config) {
  if (cluster.isPrimary) {
    let isShuttingDown = false;

    cluster.on('exit', (worker) => {
      if (!isShuttingDown && !worker.exitedAfterDisconnect) {
        cluster.fork(process.env);
      }
    });

    for (let i = 0; i < config.parallelism; i++) {
      cluster.fork(process.env);
    }

    let shutdown: Promise<void> | undefined;

    return (signal?: AbortSignal) => {
      shutdown ??= shutdownCluster(signal);

      return shutdown;
    };

    async function shutdownCluster(signal?: AbortSignal) {
      isShuttingDown = true;

      if (!cluster.workers) {
        return;
      }

      const workers = Object.values(cluster.workers).filter(
        (worker): worker is NonNullable<typeof worker> => worker !== undefined
      );

      for (const worker of workers) {
        if (!worker.isDead()) {
          try {
            worker.disconnect();
          } catch {
            worker.kill('SIGKILL');
          }
        }
      }

      const shutdown = Promise.all(workers.map(waitForWorkerExit));
      const stoppedGracefully = await waitForWorkersToStop(shutdown, signal);

      if (!stoppedGracefully) {
        for (const worker of workers) {
          if (!worker.isDead()) {
            worker.kill('SIGKILL');
          }
        }
      }

      await shutdown;
    }
  } else {
    const { shutdown } = await createWorker();

    process.once('disconnect', () => {
      void stopWorker(shutdown);
    });

    return;
  }
}

async function waitForWorkerExit(worker: Worker) {
  if (worker.isDead()) {
    return;
  }

  const resolver = Promise.withResolvers<void>();

  worker.once('exit', resolver.resolve);

  return resolver.promise;
}

async function waitForWorkersToStop(shutdown: Promise<unknown>, signal?: AbortSignal) {
  if (signal) {
    if (signal.aborted) {
      return false;
    }

    const resolver = Promise.withResolvers<unknown>();

    signal.addEventListener('abort', resolver.resolve, {
      once: true
    });

    try {
      return await Promise.race([shutdown.then(() => true), resolver.promise.then(() => false)]);
    } finally {
      signal.removeEventListener('abort', resolver.resolve);
    }
  }

  await shutdown;

  return true;
}

async function stopWorker(shutdown: Shutdown) {
  try {
    await shutdown();

    process.exit(0);
  } catch (error) {
    console.error('Worker shutdown failed', error);

    process.exit(1);
  }
}
