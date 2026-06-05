import { HttpError } from './http-error.js';

export class NotExtended extends HttpError {
  constructor(
    detail = 'Further extensions to the request are required.',
    title = 'Not Extended',
    instance = '/'
  ) {
    super('about:blank', 510, title, detail, instance);
  }
}
