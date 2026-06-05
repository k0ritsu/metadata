import { HttpError } from './http-error.js';

export class NotAcceptable extends HttpError {
  constructor(
    detail = 'The requested resource is not available in a format that can be accepted by the client.',
    title = 'Not Acceptable',
    instance = '/'
  ) {
    super('about:blank', 406, title, detail, instance);
  }
}
