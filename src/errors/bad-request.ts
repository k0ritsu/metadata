import { HttpError } from './http-error.js';

export class BadRequest extends HttpError {
  constructor(
    detail = 'The request is invalid.',
    title = 'Bad Request',
    instance = '/'
  ) {
    super('about:blank', 400, title, detail, instance);
  }
}
