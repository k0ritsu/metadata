import { HttpError } from './http-error.js';

export class InternalServerError extends HttpError {
  constructor(
    detail = 'An unexpected error occurred on the server.',
    title = 'Internal Server Error',
    instance = '/'
  ) {
    super('about:blank', 500, title, detail, instance);
  }
}
