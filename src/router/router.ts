import Router from 'find-my-way';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config/types.js';
import { HttpError } from '../errors/http-error.js';
import { InternalServerError } from '../errors/internal-server-error.js';
import { NotFound } from '../errors/not-found.js';
import type { Logger } from '../logger/types.js';

type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'CONNECT'
  | 'OPTIONS'
  | 'TRACE';

interface HttpHandler {
  (
    req: Request,
    params: Record<string, string | undefined>,
    searchParams: URLSearchParams
  ): Promise<Response>;
}

export function createRouter(config: Config, logger: Logger) {
  const router = Router({
    defaultRoute(req, res) {
      const err = new NotFound(undefined, undefined, req.url);

      return res
        .writeHead(err.status, {
          'content-type': 'application/problem+json'
        })
        .end(JSON.stringify(err));
    }
  });

  return {
    lookup: router.lookup.bind(router),
    route(method: HttpMethod, path: string, handler: HttpHandler) {
      router.on(method, path, async (req, res, params, _, searchParams) => {
        try {
          const result = await handler(
            new Request(
              new URL(String(req.url), `http://localhost:${config.HTTP_PORT}`),
              {
                duplex: 'half',
                method,
                headers: transformHeaders(req.headers),
                body: extractBody(req)
              }
            ),
            params,
            new URLSearchParams(searchParams)
          );

          res.writeHead(result.status, Object.fromEntries(result.headers));

          if (result.body) {
            await pipeline(Readable.fromWeb(result.body), res);

            return res;
          }

          return res.end();
        } catch (err) {
          switch (true) {
            case err instanceof HttpError:
              return res
                .writeHead(err.status, {
                  'content-type': 'application/problem+json'
                })
                .end(JSON.stringify(err));
          }

          logger.error(String(err));

          {
            const err = new InternalServerError(undefined, undefined, req.url);

            return res
              .writeHead(err.status, {
                'content-type': 'application/problem+json'
              })
              .end(JSON.stringify(err));
          }
        }
      });
    }
  };
}

function extractBody(req: IncomingMessage): Readable | null {
  if (
    req.headers['content-length'] !== undefined ||
    req.headers['transfer-encoding'] !== undefined
  ) {
    return Readable.from(req);
  }

  return null;
}

function transformHeaders(headers: IncomingHttpHeaders): Headers {
  return Object.entries(headers).reduce((acc, [key, val]) => {
    if (val == null) {
      return acc;
    }

    if (Array.isArray(val)) {
      val.forEach((val) => acc.append(key, val));
    } else {
      acc.append(key, val);
    }

    return acc;
  }, new Headers());
}
