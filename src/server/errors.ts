export class AppError extends Error {
  code: string;
  key: string | undefined;
  params: Record<string, unknown> | undefined;

  // `info.key` and `info.params` let the browser show the message in the person's language.
  constructor(code: string, message: string, info: { key?: string; params?: Record<string, unknown> } = {}) {
    super(message);
    this.code = code;
    this.key = info.key;
    this.params = info.params;
  }
}

// A failure from a shared helper such as ageInMonths, which attaches the i18n `key` to the error it throws.
export function invalidInputFrom(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err);
  const key = typeof err === 'object' && err !== null && 'key' in err && typeof err.key === 'string' ? err.key : undefined;
  return new AppError('invalid-input', message, { key });
}
