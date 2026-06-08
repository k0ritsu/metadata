export class HttpError extends Error {
  readonly type: string;
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly instance: string;

  constructor(
    type: string,
    status: number,
    title: string,
    detail: string,
    instance: string
  ) {
    super(`${status} ${title}: ${detail}`);

    this.type = type;
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.instance = instance;
  }

  withInstance(instance = '/') {
    new HttpError(this.type, this.status, this.title, this.detail, instance);
  }

  toJSON() {
    return {
      type: this.type,
      status: this.status,
      title: this.title,
      detail: this.detail,
      instance: this.instance
    };
  }
}
