import http from 'node:http';
import type { Router } from './router/types.js';

interface Config {
  port: number;
}

export async function createServer(
  lookup: Router['lookup'],
  config: Config
): Promise<http.Server> {
  const resolver = Promise.withResolvers<void>();
  const server = http
    .createServer(lookup)
    .listen(config.port, resolver.resolve.bind(resolver));

  await resolver.promise;

  return server;
}
