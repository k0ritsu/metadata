import assert from 'node:assert/strict';
import cluster from 'node:cluster';
import test from 'node:test';
import { createCluster } from '../src/cluster.js';

if (cluster.isPrimary) {
  test('cluster kills a worker when the shutdown signal is aborted', async () => {
    const workerReady = new Promise<void>((resolve) => {
      cluster.once('message', (_worker, message) => {
        if (message === 'ready') {
          resolve();
        }
      });
    });
    const workerExit = new Promise<NodeJS.Signals | null>((resolve) => {
      cluster.once('exit', (_worker, _code, signal) => {
        resolve(signal);
      });
    });
    const shutdown = await createCluster(
      async () => {
        throw new Error('Primary must not create a worker application');
      },
      {
        parallelism: 1
      }
    );

    await workerReady;

    const controller = new AbortController();
    const shutdownPromise = shutdown?.(controller.signal);

    controller.abort();

    await shutdownPromise;

    assert.equal(await workerExit, 'SIGKILL');
  });
} else {
  await createCluster(
    async () => ({
      shutdown: async () => {
        await new Promise<void>(() => {
          setInterval(() => {}, 1_000);
        });
      }
    }),
    {
      parallelism: 1
    }
  );

  process.send?.('ready');
}
