import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import type { Config } from '../src/config/types.ts';
import type { Logger } from '../src/logger/types.ts';
import { createRouter } from '../src/router/router.ts';

type Router = ReturnType<typeof createRouter>;

const config: Config = {
  APP_NAME: 'test',
  APP_VERSION: '0.0.0',
  HTTP_PORT: 3000,
  HTTP_VERSION: 'http1.1',
  LOG_LEVEL: 'error',
  USE_PARALLELISM: false
};

const logger: Logger = {
  debug() {},
  error() {},
  info() {},
  warn() {}
};

test('router use composes middleware around route handlers', async () => {
  const router = createRouter(config, logger);
  const calls: string[] = [];

  router.use(async (_req, _context, next) => {
    calls.push('root-before');

    const res = await next();

    calls.push(`root-after:${res.headers.get('x-handler')}`);

    return res;
  });

  router.group('/api', (group) => {
    group.use(async (_req, context, next) => {
      const { params, searchParams } = context;

      calls.push(`group:${params['id']}:${searchParams.get('q')}`);

      return next();
    });

    group.route('GET', '/items/:id', async () => {
      calls.push('handler');

      return new Response('ok', {
        headers: {
          'x-handler': 'yes'
        },
        statusText: 'Fine'
      });
    });
  });

  const res = await inject(router, 'GET', '/api/items/42?q=value');

  assert.equal(res.status, 200);
  assert.equal(res.statusText, 'Fine');
  assert.equal(res.body, 'ok');
  assert.deepEqual(calls, ['root-before', 'group:42:value', 'handler', 'root-after:yes']);
});

test('router use can short-circuit a route handler', async () => {
  const router = createRouter(config, logger);
  let handled = false;

  router.use(async () => {
    return new Response('blocked', {
      status: 401
    });
  });

  router.route('GET', '/secret', async () => {
    handled = true;

    return new Response('secret');
  });

  const res = await inject(router, 'GET', '/secret');

  assert.equal(res.status, 401);
  assert.equal(res.body, 'blocked');
  assert.equal(handled, false);
});

test('router use applies to routes registered after it', async () => {
  const router = createRouter(config, logger);

  router.route('GET', '/before', async () => {
    return new Response('before');
  });

  router.use(async (_req, _context, next) => {
    const res = await next();

    return new Response(await res.text(), {
      headers: {
        'x-middleware': 'on'
      },
      status: res.status
    });
  });

  router.route('GET', '/after', async () => {
    return new Response('after');
  });

  const before = await inject(router, 'GET', '/before');
  const after = await inject(router, 'GET', '/after');

  assert.equal(before.headers.get('x-middleware'), null);
  assert.equal(before.body, 'before');

  assert.equal(after.headers.get('x-middleware'), 'on');
  assert.equal(after.body, 'after');
});

test('router groups isolate middleware between sibling groups', async () => {
  const router = createRouter(config, logger);
  const calls: string[] = [];

  router.group('', (group) => {
    group.use(async (_req, _context, next) => {
      calls.push('first-before');

      const res = await next();

      calls.push('first-after');

      return res;
    });

    group.route('GET', '/first', async () => {
      calls.push('first-handler');

      return new Response('first');
    });
  });

  router.group('', (group) => {
    group.route('GET', '/second', async () => {
      calls.push('second-handler');

      return new Response('second');
    });
  });

  const first = await inject(router, 'GET', '/first');
  const second = await inject(router, 'GET', '/second');

  assert.equal(first.body, 'first');
  assert.equal(second.body, 'second');
  assert.deepEqual(calls, ['first-before', 'first-handler', 'first-after', 'second-handler']);
});

test('router maps http2 pseudo headers into the web request url and body', async () => {
  const router = createRouter(config, logger);

  router.route('POST', '/items', async (req) => {
    assert.equal(req.url, 'https://example.test/items?q=value');
    assert.deepEqual(
      Array.from(req.headers.keys()).filter((key) => key.startsWith(':')),
      []
    );

    return new Response(await req.text());
  });

  const res = await inject(router, 'POST', '/items?q=value', {
    body: 'payload',
    headers: {
      ':authority': 'example.test',
      ':scheme': 'https'
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body, 'payload');
});

test('router filters hop-by-hop response headers', async () => {
  const router = createRouter(config, logger);

  router.route('GET', '/headers', async () => {
    return new Response('ok', {
      headers: {
        connection: 'close',
        'transfer-encoding': 'chunked',
        'x-safe': 'yes'
      }
    });
  });

  const res = await inject(router, 'GET', '/headers');

  assert.equal(res.headers.get('connection'), null);
  assert.equal(res.headers.get('transfer-encoding'), null);
  assert.equal(res.headers.get('x-safe'), 'yes');
});

test('router sends trailers from handler context', async () => {
  const router = createRouter(config, logger);

  router.route('POST', '/grpc.Service/Unary', async (_req, context) => {
    context.trailers.set('grpc-status', '0');
    context.trailers.set('grpc-message', '');

    return new Response(new Uint8Array([0, 0, 0, 0, 0]), {
      headers: {
        'content-type': 'application/grpc'
      }
    });
  });

  const res = await inject(router, 'POST', '/grpc.Service/Unary', {
    body: new Uint8Array([0, 0, 0, 0, 0]),
    headers: {
      ':authority': 'example.test',
      ':scheme': 'https',
      'content-type': 'application/grpc',
      te: 'trailers'
    },
    httpVersion: '2.0'
  });

  assert.equal(res.headers.get('content-type'), 'application/grpc');
  assert.equal(res.trailers.get('grpc-status'), '0');
  assert.equal(res.trailers.get('grpc-message'), '');
});

test('router advertises trailers for http1 responses', async () => {
  const router = createRouter(config, logger);

  router.route('POST', '/grpc.Service/Unary', async (_req, context) => {
    context.trailers.set('grpc-status', '0');

    return new Response(null, {
      headers: {
        'content-type': 'application/grpc'
      }
    });
  });

  const res = await inject(router, 'POST', '/grpc.Service/Unary');

  assert.equal(res.headers.get('trailer'), 'grpc-status');
  assert.equal(res.trailers.get('grpc-status'), '0');
});

interface InjectedResponse {
  body: string;
  headers: Headers;
  status: number;
  statusText: string;
  trailers: Headers;
}

interface MockRequest extends Readable {
  headers: Record<string, string>;
  httpVersion?: string;
  method: string;
  url: string;
}

interface MockResponse extends Writable {
  headers: Record<string, string>;
  statusCode: number;
  statusText: string;
  trailers: Record<string, string>;
  addTrailers(headers: Record<string, string>): void;
  writeHead(status: number, statusText: string, headers?: Record<string, string>): this;
}

interface InjectOptions {
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  httpVersion?: string;
}

async function inject(
  router: Router,
  method: string,
  url: string,
  options: InjectOptions = {}
): Promise<InjectedResponse> {
  let bodySent = false;
  const req = new Readable({
    read() {
      if (bodySent) {
        this.push(null);

        return;
      }

      bodySent = true;
      if (options.body !== undefined) {
        this.push(options.body);
      }

      this.push(null);
    }
  }) as MockRequest;

  req.headers = options.headers ?? {};
  req.httpVersion = options.httpVersion;
  req.method = method;
  req.url = url;

  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  }) as MockResponse;

  res.statusCode = 200;
  res.statusText = '';
  res.headers = {};
  res.trailers = {};
  res.addTrailers = (headers) => {
    res.trailers = headers;
  };
  res.writeHead = (status, statusText, headers) => {
    res.statusCode = status;
    res.statusText = statusText;
    res.headers = headers ?? {};

    return res;
  };

  const finished = new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
  });

  router.lookup(req as unknown as IncomingMessage, res as unknown as ServerResponse);

  await finished;

  return {
    body: Buffer.concat(chunks).toString('utf8'),
    headers: new Headers(res.headers),
    status: res.statusCode,
    statusText: res.statusText,
    trailers: new Headers(res.trailers)
  };
}
