import { HttpError } from './http-error.js';

export class PreconditionFailed extends HttpError {
  constructor(
    detail = 'The precondition for the request failed.',
    title = 'Precondition Failed',
    instance = '/'
  ) {
    super('about:blank', 412, title, detail, instance);
  }
}
