import { HttpError } from './http-error.js';

export class TooEarly extends HttpError {
  constructor(
    detail = 'The server is not ready to process the request.',
    title = 'Too Early',
    instance = '/'
  ) {
    super('about:blank', 425, title, detail, instance);
  }
}
