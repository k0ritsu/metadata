import Router from 'find-my-way';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config/types.js';
import { HttpError } from '../errors/http-error.js';
import { InternalServerError } from '../errors/internal-server-error.js';
import { NotFound } from '../errors/not-found.js';
import type { Logger } from '../logger/types.js';
import type { HttpRequest, HttpResponse, HttpVersion } from '../server.js';

class RouterError extends Error {}

const CONNECTION_SPECIFIC_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

export type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'CONNECT'
  | 'OPTIONS'
  | 'TRACE';

type HttpHandlerArgs = [req: Request, context: HttpContext];
export interface HttpHandler {
  (...args: HttpHandlerArgs): Promise<Response>;
}

type HttpMiddlewareArgs = [...HttpHandlerArgs, next: () => ReturnType<HttpHandler>];
export interface HttpMiddleware {
  (...args: HttpMiddlewareArgs): Promise<Response>;
}

interface HttpContext {
  httpVersion: HttpVersion;
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
  trailers: Headers;
}

export interface RouterGroup {
  route(method: HttpMethod, path: string, handler: HttpHandler): void;
  group(prefix: string, callback: (router: RouterGroup) => void): void;
  use(middleware: HttpMiddleware): void;
}

export type Router<V extends HttpVersion = HttpVersion> = ReturnType<typeof createRouter<V>>;

export function createRouter<V extends HttpVersion>(config: Config, logger: Logger) {
  const router = Router<
    {
      'http1.1': Router.HTTPVersion.V1;
      http2: Router.HTTPVersion.V2;
    }[V]
  >({
    defaultRoute(req: HttpRequest, res: HttpResponse) {
      const err = new NotFound(undefined, undefined, req.url);

      return res
        .writeHead(err.status, err.title, {
          'content-type': 'application/problem+json'
        })
        .end(JSON.stringify(err));
    }
  });

  function createRouterGroup(prefix = '', middlewares: HttpMiddleware[] = []) {
    return {
      route(method: HttpMethod, path: string, handler: HttpHandler) {
        handler = composeMiddleware([...middlewares], handler);

        router.on(
          method,
          normalizePath(prefix, path),
          async (req: HttpRequest, res: HttpResponse, params, _, searchParams) => {
            const context = createHttpContext(req, params, searchParams, config);
            try {
              const result = await handler(
                new Request(createRequestUrl(req, config), {
                  duplex: 'half',
                  method,
                  headers: extractIncomingHeaders(req),
                  body: extractBody(req)
                }),
                context
              );

              const headers = extractOutgoingHeaders(result.headers);

              const trailers = extractOutgoingHeaders(context.trailers);
              const trailersPresent = Object.keys(trailers).length > 0;

              if (context.httpVersion === 'http1.1' && trailersPresent) {
                headers.trailer = Object.keys(trailers).join(', ');
              }

              res.writeHead(result.status, result.statusText, headers);

              if (result.body) {
                await pipeline(Readable.fromWeb(result.body), res, {
                  end: false
                });
              }

              if (trailersPresent) {
                res.addTrailers(trailers);
              }

              return res.end();
            } catch (err) {
              switch (true) {
                case err instanceof HttpError:
                  return res
                    .writeHead(err.status, err.title, {
                      'content-type': 'application/problem+json'
                    })
                    .end(JSON.stringify(err.withInstance(req.url)));
              }

              logger.error(String(err));

              {
                const err = new InternalServerError(undefined, undefined, req.url);

                return res
                  .writeHead(err.status, err.title, {
                    'content-type': 'application/problem+json'
                  })
                  .end(JSON.stringify(err));
              }
            }
          }
        );
      },
      group(path: string, callback: (router: RouterGroup) => void) {
        path = normalizePath(prefix, path);

        callback(createRouterGroup(path, [...middlewares]));
      },
      use(middleware: HttpMiddleware) {
        middlewares.push(middleware);
      }
    };
  }

  return {
    lookup: router.lookup.bind(router),
    ...createRouterGroup()
  };
}

function composeMiddleware(middlewares: HttpMiddleware[], handler: HttpHandler) {
  return async (req: Request, context: HttpContext) => {
    async function dispatch(index: number, req: Request, context: HttpContext): Promise<Response> {
      const middleware = middlewares[index];
      if (!middleware) {
        return handler(req, context);
      }

      let nextCalled = false;

      return middleware(req, context, () => {
        if (nextCalled) {
          throw new RouterError('next() called multiple times');
        }

        nextCalled = true;

        return dispatch(index + 1, req, context);
      });
    }

    return dispatch(0, req, context);
  };
}

function normalizePath(...paths: string[]) {
  return `/${paths
    .flatMap((path) => path.split('/'))
    .filter(Boolean)
    .join('/')}`;
}

function createRequestUrl(req: HttpRequest, config: Config) {
  const scheme = getHeader(req.headers[':scheme']) ?? getConfiguredScheme(config);
  const authority =
    getHeader(req.headers[':authority']) ??
    getHeader(req.headers.host) ??
    `localhost:${config.HTTP_PORT}`;

  return new URL(String(req.url ?? '/'), `${scheme}://${authority}`);
}

function getConfiguredScheme(config: Config) {
  return typeof config.TLS_CERT_PATH !== 'undefined' && typeof config.TLS_KEY_PATH !== 'undefined'
    ? 'https'
    : 'http';
}

function createHttpContext(
  req: HttpRequest,
  params: Record<string, string | undefined>,
  searchParams: Record<string, string>,
  config: Config
): HttpContext {
  let httpVersion = config.HTTP_VERSION;

  switch (true) {
    case req.httpVersion?.startsWith('2'):
      httpVersion = 'http2';
      break;
    case typeof req.httpVersion !== 'undefined':
      httpVersion = 'http1.1';
      break;
  }

  return {
    httpVersion,
    params,
    searchParams: new URLSearchParams(searchParams),
    trailers: new Headers()
  };
}

function extractBody(req: HttpRequest) {
  if (hasBody(req)) {
    return Readable.from(req);
  }

  return null;
}

function hasBody(req: HttpRequest) {
  const { method, headers } = req;
  switch (method) {
    case 'HEAD':
    case 'GET':
      return false;
  }

  return getHeader(headers['content-length']) !== '0';
}

function extractIncomingHeaders(req: HttpRequest) {
  return Object.entries(req.headers).reduce((acc, [key, val]) => {
    if (key.startsWith(':')) {
      return acc;
    }

    switch (true) {
      case typeof val === 'string':
        acc.append(key, val);
        break;
      case Array.isArray(val):
        val.forEach((val) => acc.append(key, val));
        break;
    }

    return acc;
  }, new Headers());
}

function extractOutgoingHeaders(headers: Headers) {
  return Array.from(headers.entries()).reduce<OutgoingHttpHeaders>((acc, [key, val]) => {
    key = key.toLowerCase();

    if (key.startsWith(':') || CONNECTION_SPECIFIC_HEADERS.has(key)) {
      return acc;
    }

    acc[key] = val;

    return acc;
  }, {});
}

function getHeader(value: IncomingHttpHeaders[string]) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
