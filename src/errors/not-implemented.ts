import { HttpError } from './http-error.js';

export class NotImplemented extends HttpError {
  constructor(
    detail = 'The request method is not implemented.',
    title = 'Not Implemented',
    instance = '/'
  ) {
    super('about:blank', 501, title, detail, instance);
  }
}
