import { HttpError } from './http-error.js';

export class BadGateway extends HttpError {
  constructor(
    detail = 'The upstream server returned an invalid response.',
    title = 'Bad Gateway',
    instance = '/'
  ) {
    super('about:blank', 502, title, detail, instance);
  }
}
