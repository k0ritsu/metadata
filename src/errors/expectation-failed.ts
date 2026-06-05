import { HttpError } from './http-error.js';

export class ExpectationFailed extends HttpError {
  constructor(
    detail = 'The expectation header cannot be met.',
    title = 'Expectation Failed',
    instance = '/'
  ) {
    super('about:blank', 417, title, detail, instance);
  }
}
