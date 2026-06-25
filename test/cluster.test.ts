import assert from 'node:assert/strict';
import cluster from 'node:cluster';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createCluster } from '../src/cluster.js';

const WORKER_SHUTDOWN_DELAY = 50;

if (cluster.isPrimary) {
  test('cluster waits for workers to exit during shutdown', async () => {
    const workerReady = new Promise<void>((resolve) => {
      cluster.once('message', (_worker, message) => {
        if (message === 'ready') {
          resolve();
        }
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

    const startedAt = performance.now();
    await shutdown?.();

    assert.ok(performance.now() - startedAt >= WORKER_SHUTDOWN_DELAY);
  });
} else {
  await createCluster(
    async () => ({
      shutdown: async () => {
        await delay(WORKER_SHUTDOWN_DELAY);
      }
    }),
    {
      parallelism: 1
    }
  );

  process.send?.('ready');
}
