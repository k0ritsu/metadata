import { HttpError } from './http-error.js';

export class UnprocessableEntity extends HttpError {
  constructor(
    detail = 'The request could not be processed.',
    title = 'Unprocessable Entity',
    instance = '/'
  ) {
    super('about:blank', 422, title, detail, instance);
  }
}
