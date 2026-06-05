import { HttpError } from './http-error.js';

export class ImATeapot extends HttpError {
  constructor(
    detail = "I'm a teapot.",
    title = "I'm a teapot",
    instance = '/'
  ) {
    super('about:blank', 418, title, detail, instance);
  }
}
