import type { ErrorRequestHandler, Request, Response } from 'express';
import { AppError } from '../../../shared/errors/index.js';
import { createErrorResponse } from '../../../shared/utils/index.js';
import type { Logger } from '../../../logger.js';

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Central error handler. Maps `AppError` subclasses to their intended HTTP
 * status codes (already encoded on the error instance), sanitises unexpected
 * internal errors (the stack trace is never exposed to the client), logs
 * everything with the structured logger and responds using the standard
 * `createErrorResponse` envelope.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next) => {
    const requestId = req.requestId;

    if (isAppError(err)) {
      const { code, message, details } = {
        code: err.code,
        message: err.message,
        details: err.details,
      };
      if (err.statusCode >= 500) {
        logger.error({ err, requestId, path: req.path }, 'application error');
      } else {
        logger.warn({ err, requestId, path: req.path }, 'application error');
      }
      res.status(err.statusCode).json(createErrorResponse(code, message, requestId, details));
      return;
    }

    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)), requestId, path: req.path },
      'unhandled error',
    );
    res
      .status(500)
      .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred', requestId));
  };
}
