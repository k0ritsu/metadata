import { HttpError } from './http-error.js';

export class NetworkAuthenticationRequired extends HttpError {
  constructor(
    detail = 'Network authentication is required.',
    title = 'Network Authentication Required',
    instance = '/'
  ) {
    super('about:blank', 511, title, detail, instance);
  }
}
