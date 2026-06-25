import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { Readable, Writable } from 'node:stream';
import type { Router } from './router/types.js';

export type HttpVersion = 'http1.1' | 'http2';

export interface HttpRequest extends Readable {
  httpVersion?: string | undefined;
  method?: string | undefined;
  url?: string | undefined;
  headers: IncomingHttpHeaders;
}

export interface HttpResponse extends Writable {
  writeHead(status: number, headers: OutgoingHttpHeaders): this;
  addTrailers(headers: OutgoingHttpHeaders): void;
}

interface Config<V> {
  port: number;
  version: V;
  tls?:
    | {
        cert: string;
        key: string;
      }
    | undefined;
}

export async function createServer<V extends HttpVersion>(
  lookup: Router<V>['lookup'],
  config: Config<V>
) {
  switch (true) {
    case matchHttpVersion('http1.1', lookup, config): {
      if (config.tls) {
        const https = await import('node:https');

        const resolver = Promise.withResolvers<void>();
        const server = https.createServer(config.tls, lookup).listen(config.port, resolver.resolve);

        await resolver.promise;

        return server;
      } else {
        const http = await import('node:http');

        const resolver = Promise.withResolvers<void>();
        const server = http.createServer(lookup).listen(config.port, resolver.resolve);

        await resolver.promise;

        return server;
      }
    }
    case matchHttpVersion('http2', lookup, config): {
      const http2 = await import('node:http2');

      const resolver = Promise.withResolvers<void>();
      const server = config.tls
        ? http2.createSecureServer(
            {
              allowHTTP1: true,
              ...config.tls
            },
            lookup
          )
        : http2.createServer(lookup);

      server.listen(config.port, resolver.resolve);

      await resolver.promise;

      return server;
    }
    default: {
      throw new Error('Unknown http version');
    }
  }
}

export function extractRequestInfo(req: HttpRequest) {
  return [
    'userAgent',
    req.headers['user-agent'],
    'forwardedFor',
    req.headers['x-forwarded-for']
  ] as const;
}

function matchHttpVersion<V extends HttpVersion>(
  version: V,
  lookup: Router<HttpVersion>['lookup'],
  config: Config<HttpVersion>
): lookup is Router<V>['lookup'] {
  return version === config.version && typeof lookup === 'function';
}
