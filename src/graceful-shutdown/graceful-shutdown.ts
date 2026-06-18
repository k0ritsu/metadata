import process from 'node:process';
import { DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT } from '../constants.js';
import type { Shutdown } from './types.js';

class GracefulShutdownTimeout extends Error {
  constructor(timeout: number) {
    super(`Graceful shutdown timed out after ${timeout}ms`);
  }
}

interface Config {
  timeout: number;
}

export function gracefulShutdown(
  shutdown?: Shutdown,
  config: Config = {
    timeout: DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT
  }
) {
  const { timeout } = config;

  let isShuttingDown = false;

  async function listener() {
    if (isShuttingDown || typeof shutdown !== 'function') {
      return;
    }

    isShuttingDown = true;

    await Promise.race([
      shutdown?.(),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new GracefulShutdownTimeout(timeout));
        }, timeout);
      })
    ]);

    process.exit(0);
  }

  process.on('SIGINT', listener);
  process.on('SIGTERM', listener);
}
