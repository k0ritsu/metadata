import { HttpError } from './http-error.js';

export class UpgradeRequired extends HttpError {
  constructor(
    detail = 'The client should upgrade to a different protocol.',
    title = 'Upgrade Required',
    instance = '/'
  ) {
    super('about:blank', 426, title, detail, instance);
  }
}
