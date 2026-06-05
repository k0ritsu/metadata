import { HttpError } from './http-error.js';

export class ServiceUnavailable extends HttpError {
  constructor(
    detail = 'The service is temporarily unavailable.',
    title = 'Service Unavailable',
    instance = '/'
  ) {
    super('about:blank', 503, title, detail, instance);
  }
}
