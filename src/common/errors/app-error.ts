import { ERROR_CODES, type ErrorCode } from "@eventis/contracts";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly options: {
      fields?: Record<string, string[]>;
      retryAfterSeconds?: number;
      internal?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
  }

  static notFound(what: string): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, `${what} was not found`, 404);
  }

  static forbidden(message = "You do not have access to this"): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
  }

  static unauthenticated(message = "Sign in to continue"): AppError {
    return new AppError(ERROR_CODES.UNAUTHENTICATED, message, 401);
  }

  static validation(fields: Record<string, string[]>): AppError {
    return new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "Some fields need attention",
      422,
      {
        fields,
      },
    );
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, 409);
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many attempts. Try again shortly.",
      429,
      {
        retryAfterSeconds,
      },
    );
  }
}
