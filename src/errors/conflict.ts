import { HttpError } from './http-error.js';

export class Conflict extends HttpError {
  constructor(
    detail = 'The request conflicts with the current resource state.',
    title = 'Conflict',
    instance = '/'
  ) {
    super('about:blank', 409, title, detail, instance);
  }
}
