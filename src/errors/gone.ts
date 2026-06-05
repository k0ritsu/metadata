import { HttpError } from './http-error.js';

export class Gone extends HttpError {
  constructor(
    detail = 'The requested resource is no longer available.',
    title = 'Gone',
    instance = '/'
  ) {
    super('about:blank', 410, title, detail, instance);
  }
}
