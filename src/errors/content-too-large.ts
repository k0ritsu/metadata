import { HttpError } from './http-error.js';

export class ContentTooLarge extends HttpError {
  constructor(
    detail = 'The request payload is too large.',
    title = 'Content Too Large',
    instance = '/'
  ) {
    super('about:blank', 413, title, detail, instance);
  }
}
