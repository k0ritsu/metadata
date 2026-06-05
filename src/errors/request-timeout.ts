import { HttpError } from './http-error.js';

export class RequestTimeout extends HttpError {
  constructor(
    detail = 'The server timed out waiting for the request.',
    title = 'Request Timeout',
    instance = '/'
  ) {
    super('about:blank', 408, title, detail, instance);
  }
}
