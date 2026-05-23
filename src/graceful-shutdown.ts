import process from 'node:process';
import { DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT } from './constants.js';

class GracefulShutdownTimeout extends Error {
  constructor(timeout: number) {
    super(`Graceful shutdown timed out after ${timeout}ms`);
  }
}

interface Shutdown {
  (): Promise<void>;
}

interface Config {
  timeout: number;
}

export function gracefulShutdown(
  shutdown: Shutdown,
  config: Config = {
    timeout: DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT
  }
) {
  const { timeout } = config;

  async function listener(signal: NodeJS.Signals) {
    await Promise.race([
      shutdown(),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new GracefulShutdownTimeout(timeout));
        }, timeout);
      })
    ]);

    process.kill(process.pid, signal);
  }

  process.once('SIGINT', listener);
  process.once('SIGTERM', listener);
}
