import { HttpError } from './http-error.js';

export class RequestHeaderFieldsTooLarge extends HttpError {
  constructor(
    detail = 'The request header fields are too large.',
    title = 'Request Header Fields Too Large',
    instance = '/'
  ) {
    super('about:blank', 431, title, detail, instance);
  }
}
