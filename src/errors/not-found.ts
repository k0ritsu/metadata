import { HttpError } from './http-error.js';

export class NotFound extends HttpError {
  constructor(
    detail = 'The requested resource was not found on this server.',
    instance = '/'
  ) {
    super('about:blank', 404, 'Not Found', detail, instance);
  }
}
