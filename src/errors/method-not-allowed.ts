import { HttpError } from './http-error.js';

export class MethodNotAllowed extends HttpError {
  constructor(
    detail = 'The requested method is not allowed.',
    title = 'Method Not Allowed',
    instance = '/'
  ) {
    super('about:blank', 405, title, detail, instance);
  }
}
