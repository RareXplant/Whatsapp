import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../../../logger.js';

/**
 * Ensures every request carries a unique request id. If a client-supplied
 * `X-Request-Id` header is present it is honoured, otherwise a fresh id is
 * generated. The id is attached to the request body, echoed back in the
 * `X-Request-Id` response header and stored in `res.locals` for logging and
 * audit purposes.
 */
export function requestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const headerValue = req.header('X-Request-Id');
    const requestId = headerValue && headerValue.trim().length > 0 ? headerValue : randomUUID();

    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    logger.debug({ requestId }, 'assigned request id');
    next();
  };
}
