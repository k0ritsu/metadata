import { HttpError } from './http-error.js';

export class PaymentRequired extends HttpError {
  constructor(
    detail = 'Payment is required to access this resource.',
    title = 'Payment required',
    instance = '/'
  ) {
    super('about:blank', 400, title, detail, instance);
  }
}
