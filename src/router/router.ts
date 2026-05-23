import Router from 'find-my-way';
import { NotFound } from '../errors/not-found.js';

export function createRouter() {
  return Router({
    defaultRoute: (req, res) => {
      const err = new NotFound(undefined, req.url);

      return res
        .writeHead(err.status, {
          'content-type': 'application/problem+json'
        })
        .end(JSON.stringify(err));
    }
  });
}
