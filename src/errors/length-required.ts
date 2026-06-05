import { HttpError } from './http-error.js';

export class LengthRequired extends HttpError {
  constructor(
    detail = 'The Content-Length header is required.',
    title = 'Length Required',
    instance = '/'
  ) {
    super('about:blank', 411, title, detail, instance);
  }
}
