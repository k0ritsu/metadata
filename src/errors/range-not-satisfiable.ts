import { HttpError } from './http-error.js';

export class RangeNotSatisfiable extends HttpError {
  constructor(
    detail = 'The requested range is not satisfiable.',
    title = 'Range Not Satisfiable',
    instance = '/'
  ) {
    super('about:blank', 416, title, detail, instance);
  }
}
