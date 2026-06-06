import { HttpError } from './http-error.js';

export class Forbidden extends HttpError {
  constructor(
    detail = 'You are not allowed to perform this action.',
    title = 'Forbidden',
    instance = '/'
  ) {
    super('about:blank', 403, title, detail, instance);
  }
}
