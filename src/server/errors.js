export class AppError extends Error {
  // `info.key` and `info.params` let the browser show the message in the person's language.
  constructor(code, message, info = {}) {
    super(message);
    this.code = code;
    this.key = info.key;
    this.params = info.params;
  }
}
