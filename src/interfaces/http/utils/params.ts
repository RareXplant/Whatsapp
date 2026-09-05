import type { Request } from 'express';

/**
 * Reads a single-valued route parameter. With `@types/express@5` route params
 * may be typed as `string | string[]`; this helper normalises to a string.
 */
export function getRouteParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
