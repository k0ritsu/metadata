import { HttpError } from './http-error.js';

export class LoopDetected extends HttpError {
  constructor(
    detail = 'An infinite loop has been detected.',
    title = 'Loop Detected',
    instance = '/'
  ) {
    super('about:blank', 508, title, detail, instance);
  }
}
