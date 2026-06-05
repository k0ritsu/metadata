import { HttpError } from './http-error.js';

export class Locked extends HttpError {
  constructor(
    detail = 'The resource is locked.',
    title = 'Locked',
    instance = '/'
  ) {
    super('about:blank', 423, title, detail, instance);
  }
}
