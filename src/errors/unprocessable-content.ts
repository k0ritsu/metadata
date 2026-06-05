import { HttpError } from './http-error.js';

export class UnprocessableContent extends HttpError {
  constructor(
    detail = 'The request content cannot be processed.',
    title = 'Unprocessable Content',
    instance = '/'
  ) {
    super('about:blank', 422, title, detail, instance);
  }
}
