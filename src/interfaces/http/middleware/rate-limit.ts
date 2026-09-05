import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { config } from '../../../config.js';

/**
 * Applies a global rate limiter backed by an in-memory store. When
 * `RATE_LIMIT_ENABLED` is false the middleware is a no-op pass-through so the
 * application can still boot and be tested without the limiter.
 */
export function rateLimitMiddleware(): RequestHandler {
  if (!config.RATE_LIMIT_ENABLED) {
    return (_req, _res, next) => {
      next();
    };
  }

  const limiterOptions: Partial<Options> = {
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    },
  };

  return rateLimit(limiterOptions);
}

/**
 * A stricter limiter intended for auth endpoints such as login, which should be
 * throttled more aggressively. Disabled when `RATE_LIMIT_ENABLED` is false.
 */
export function strictRateLimitMiddleware(windowMs = 60_000, limit = 10): RequestHandler {
  if (!config.RATE_LIMIT_ENABLED) {
    return (_req, _res, next) => {
      next();
    };
  }

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    },
  });
}
