import { HttpError } from './http-error.js';

export class InsufficientStorage extends HttpError {
  constructor(
    detail = 'The server has insufficient storage space.',
    title = 'Insufficient Storage',
    instance = '/'
  ) {
    super('about:blank', 507, title, detail, instance);
  }
}
