import { HttpError } from './http-error.js';

export class InternalServerError extends HttpError {
  constructor(detail = 'An internal server error occurred.', instance = '/') {
    super('about:blank', 500, 'Internal Server Error', detail, instance);
  }
}
