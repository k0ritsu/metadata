import { HttpError } from './http-error.js';

export class ProxyAuthenticationRequired extends HttpError {
  constructor(
    detail = 'Proxy authentication is required to access this resource.',
    title = 'Proxy Authentication Required',
    instance = '/'
  ) {
    super('about:blank', 407, title, detail, instance);
  }
}
