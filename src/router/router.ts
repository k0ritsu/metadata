import Router from 'find-my-way';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config/types.js';
import { HttpError } from '../errors/http-error.js';
import { InternalServerError } from '../errors/internal-server-error.js';
import { NotFound } from '../errors/not-found.js';
import type { Logger } from '../logger/types.js';

class RouterError extends Error {}

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

export interface HttpHandler {
  (
    req: Request,
    params: Record<string, string | undefined>,
    searchParams: URLSearchParams
  ): Promise<Response>;
}

export interface HttpMiddleware {
  (
    req: Request,
    params: Record<string, string | undefined>,
    searchParams: URLSearchParams,
    next: () => Promise<Response>
  ): Promise<Response>;
}

export interface RouterGroup {
  route(method: HttpMethod, path: string, handler: HttpHandler): void;
  group(prefix: string, callback: (router: RouterGroup) => void): void;
  use(middleware: HttpMiddleware): void;
}

export type Router = ReturnType<typeof createRouter>;

export function createRouter(config: Config, logger: Logger) {
  const router = Router({
    defaultRoute(req, res) {
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
        path = normalizePath(prefix, path);
        handler = composeMiddleware([...middlewares], handler);

        router.on(method, path, async (req, res, params, _, searchParams) => {
          try {
            const result = await handler(
              new Request(new URL(String(req.url), `http://localhost:${config.HTTP_PORT}`), {
                duplex: 'half',
                method,
                headers: extractHeaders(req),
                body: extractBody(req)
              }),
              params,
              new URLSearchParams(searchParams)
            );

            res.writeHead(result.status, result.statusText, Object.fromEntries(result.headers));

            if (result.body) {
              await pipeline(Readable.fromWeb(result.body), res);

              return res;
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
        });
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
  return async (
    req: Request,
    params: Record<string, string | undefined>,
    searchParams: URLSearchParams
  ) => {
    async function dispatch(
      index: number,
      req: Request,
      params: Record<string, string | undefined>,
      searchParams: URLSearchParams
    ): Promise<Response> {
      const middleware = middlewares[index];
      if (!middleware) {
        return handler(req, params, searchParams);
      }

      let nextCalled = false;

      return middleware(req, params, searchParams, () => {
        if (nextCalled) {
          throw new RouterError('next() called multiple times');
        }

        nextCalled = true;

        return dispatch(index + 1, req, params, searchParams);
      });
    }

    return dispatch(0, req, params, searchParams);
  };
}

function normalizePath(...paths: string[]) {
  return `/${paths
    .flatMap((path) => path.split('/'))
    .filter(Boolean)
    .join('/')}`;
}

function extractBody(req: IncomingMessage) {
  if (hasBody(req)) {
    return Readable.from(req);
  }

  return null;
}

function hasBody(req: IncomingMessage) {
  const { method, headers } = req;
  switch (method) {
    case 'HEAD':
    case 'GET':
      return false;
  }

  return headers['content-length'] !== undefined || headers['transfer-encoding'] !== undefined;
}

function extractHeaders(req: IncomingMessage) {
  return Object.entries(req.headers).reduce((acc, [key, val]) => {
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
