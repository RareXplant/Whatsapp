import type { Request } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../../../shared/errors/index.js';

/**
 * Validates `req.body` against the supplied Zod schema and returns the parsed
 * value. Throws a `ValidationError` (400) without leaking details when parsing
 * fails.
 */
export function validateBody<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join('.')] = issue.message;
      return acc;
    }, {});
    throw new ValidationError('Invalid request body', details);
  }
  return result.data;
}
