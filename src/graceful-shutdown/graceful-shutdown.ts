import process from 'node:process';
import { DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT } from '../constants.js';
import type { Shutdown } from './types.js';

interface Config {
  timeout: number;
}

export function gracefulShutdown(
  shutdown?: Shutdown,
  config: Config = {
    timeout: DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT
  }
) {
  let isShuttingDown = false;

  async function listener() {
    if (isShuttingDown || typeof shutdown !== 'function') {
      return;
    }

    isShuttingDown = true;

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, config.timeout).unref();

    try {
      await shutdown(abortController.signal);

      process.exitCode = Number(abortController.signal.aborted);
    } catch (error) {
      process.exitCode = 1;

      console.error('Graceful shutdown failed', error);
    } finally {
      clearTimeout(timeout);
    }

    process.exit();
  }

  process.on('SIGINT', listener);
  process.on('SIGTERM', listener);
}
