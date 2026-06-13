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

  router.use(async (_req, _params, _searchParams, next) => {
    calls.push('root-before');

    const res = await next();

    calls.push(`root-after:${res.headers.get('x-handler')}`);

    return res;
  });

  router.group('/api', (group) => {
    group.use(async (_req, params, searchParams, next) => {
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

  router.use(async (_req, _params, _searchParams, next) => {
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

interface InjectedResponse {
  body: string;
  headers: Headers;
  status: number;
  statusText: string;
}

interface MockRequest extends Readable {
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface MockResponse extends Writable {
  headers: Record<string, string>;
  statusCode: number;
  statusText: string;
  writeHead(status: number, statusText: string, headers?: Record<string, string>): this;
}

async function inject(router: Router, method: string, url: string): Promise<InjectedResponse> {
  const req = new Readable({
    read() {
      this.push(null);
    }
  }) as MockRequest;

  req.headers = {};
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
    statusText: res.statusText
  };
}
