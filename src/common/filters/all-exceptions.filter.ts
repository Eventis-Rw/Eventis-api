import { ERROR_CODES, type ApiError } from '@eventis/contracts';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../errors/app-error.js';

/**
 * Every failure leaves the API in one shape: the ApiError envelope from the contracts
 * package. Clients switch on `code`; `message` is for humans.
 *
 * The other job of this filter is making sure an internal detail never escapes. An
 * unexpected exception returns a generic message and a request id — the detail goes
 * to the logs, where the person debugging can see it and the attacker cannot.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = request.id;

    const { status, body } = this.toResponse(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId, path: request.url, method: request.method },
        'unhandled error',
      );
    } else if (exception instanceof AppError && exception.options.internal) {
      this.logger.warn(
        { requestId, code: exception.code, ...exception.options.internal },
        exception.message,
      );
    }

    void reply.status(status).send(body);
  }

  private toResponse(exception: unknown, requestId: string): { status: number; body: ApiError } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.options.fields ? { fields: exception.options.fields } : {}),
          ...(exception.options.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: exception.options.retryAfterSeconds }
            : {}),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.VALIDATION_FAILED,
          message: exception.message,
          requestId,
        },
      };
    }

    // Anything else is a bug. Say nothing useful to the caller; log everything.
    return {
      status: 500,
      body: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Something went wrong on our side. Quote the reference if you contact support.',
        requestId,
      },
    };
  }
}
