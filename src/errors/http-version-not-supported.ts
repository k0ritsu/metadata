import { HttpError } from './http-error.js';

export class HttpVersionNotSupported extends HttpError {
  constructor(
    detail = 'The HTTP version is not supported.',
    title = 'HTTP Version Not Supported',
    instance = '/'
  ) {
    super('about:blank', 505, title, detail, instance);
  }
}
