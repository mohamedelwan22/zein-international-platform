export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "SLUG_CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  SLUG_CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export type ErrorDetail = Record<string, unknown>;

export interface HttpErrorOptions {
  details?: ErrorDetail[];
  retryAfter?: number;
  cause?: unknown;
}

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, options: HttpErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }

  get isNotFound() {
    return this.code === "NOT_FOUND";
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new HttpError("VALIDATION_FAILED", message, { details });

export const unauthorized = (message = "Unauthorized") =>
  new HttpError("UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden") => new HttpError("FORBIDDEN", message);

export const notFound = (message = "Not found") => new HttpError("NOT_FOUND", message);

export const versionConflict = (currentVersion: unknown) =>
  new HttpError("VERSION_CONFLICT", "Version conflict", {
    details: [{ currentVersion: String(currentVersion) }],
  });

export const slugConflict = (message = "Slug already exists") =>
  new HttpError("SLUG_CONFLICT", message);

export const rateLimited = (retryAfter: number, message = "Rate limit exceeded") =>
  new HttpError("RATE_LIMITED", message, { retryAfter });

export const payloadTooLarge = (message = "Payload too large") =>
  new HttpError("PAYLOAD_TOO_LARGE", message);

export const unsupportedMediaType = (message = "Unsupported media type") =>
  new HttpError("UNSUPPORTED_MEDIA_TYPE", message);

export const internal = (cause?: unknown) =>
  new HttpError("INTERNAL", "Internal server error", { cause });

export interface ErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof HttpError) {
    const payload: ErrorPayload = { error: { code: error.code, message: error.message } };
    if (error.details && error.details.length > 0) {
      payload.error.details = error.details;
    }
    return payload;
  }
  return { error: { code: "INTERNAL", message: "Internal server error" } };
}

export function httpStatusFor(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  return 500;
}