import { HttpError } from './http-error.js';

export class PreconditionRequired extends HttpError {
  constructor(
    detail = 'The request requires a precondition header.',
    title = 'Precondition Required',
    instance = '/'
  ) {
    super('about:blank', 428, title, detail, instance);
  }
}
