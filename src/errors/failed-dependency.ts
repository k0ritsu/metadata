import { HttpError } from './http-error.js';

export class FailedDependency extends HttpError {
  constructor(
    detail = 'The request failed due to a previous request failure.',
    title = 'Failed Dependency',
    instance = '/'
  ) {
    super('about:blank', 424, title, detail, instance);
  }
}
