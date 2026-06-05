import { HttpError } from './http-error.js';

export class UriTooLong extends HttpError {
  constructor(
    detail = 'The request URI is too long.',
    title = 'URI Too Long',
    instance = '/'
  ) {
    super('about:blank', 414, title, detail, instance);
  }
}
