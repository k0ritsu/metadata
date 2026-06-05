import { HttpError } from './http-error.js';

export class GatewayTimeout extends HttpError {
  constructor(
    detail = 'The upstream server failed to respond in time.',
    title = 'Gateway Timeout',
    instance = '/'
  ) {
    super('about:blank', 504, title, detail, instance);
  }
}
