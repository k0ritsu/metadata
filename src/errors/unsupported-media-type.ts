import { HttpError } from './http-error.js';

export class UnsupportedMediaType extends HttpError {
  constructor(
    detail = 'The request media type is not supported.',
    title = 'Unsupported Media Type',
    instance = '/'
  ) {
    super('about:blank', 415, title, detail, instance);
  }
}
