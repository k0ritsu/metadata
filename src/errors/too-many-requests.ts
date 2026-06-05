import { HttpError } from './http-error.js';

export class TooManyRequests extends HttpError {
  constructor(
    detail = 'You have sent too many requests in a given amount of time.',
    title = 'Too Many Requests',
    instance = '/'
  ) {
    super('about:blank', 429, title, detail, instance);
  }
}
