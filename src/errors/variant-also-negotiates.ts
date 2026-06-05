import { HttpError } from './http-error.js';

export class VariantAlsoNegotiates extends HttpError {
  constructor(
    detail = 'The variant also negotiates.',
    title = 'Variant Also Negotiates',
    instance = '/'
  ) {
    super('about:blank', 506, title, detail, instance);
  }
}
