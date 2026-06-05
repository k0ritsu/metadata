import { HttpError } from './http-error.js';

export class Unauthorized extends HttpError {
  constructor(
    detail = 'Authentication is required.',
    title = 'Unauthorized',
    instance = '/'
  ) {
    super('about:blank', 401, title, detail, instance);
  }
}
