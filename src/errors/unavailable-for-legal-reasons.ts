import { HttpError } from './http-error.js';

export class UnavailableForLegalReasons extends HttpError {
  constructor(
    detail = 'The resource is unavailable for legal reasons.',
    title = 'Unavailable For Legal Reasons',
    instance = '/'
  ) {
    super('about:blank', 451, title, detail, instance);
  }
}
