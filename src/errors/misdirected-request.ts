import { HttpError } from './http-error.js';

export class MisdirectedRequest extends HttpError {
  constructor(
    detail = 'The request was directed at the wrong server.',
    title = 'Misdirected Request',
    instance = '/'
  ) {
    super('about:blank', 421, title, detail, instance);
  }
}
