import type { RequestHandler } from 'express';
import type { UserRole, User, ApiKey } from '../../../domain/entities/index.js';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/index.js';
import type { HttpDependencies } from '../types/index.js';

const API_KEY_HEADER = 'x-api-key';
const AUTHORIZATION_HEADER = 'authorization';

function extractBearerToken(authValue: string | undefined): string | null {
  if (!authValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authValue.trim());
  return match ? match[1] : null;
}

function asUser(value: unknown): User {
  return value as User;
}

function asApiKey(value: unknown): ApiKey {
  return value as ApiKey;
}

/**
 * Authenticates a request either through a `Bearer <jwt>` token or an
 * `X-API-Key` header. On success the resolved identity is attached to the
 * request as `tenantId`, `userId`, `role`, `apiKeyId` and `userEmail`. Throws a
 * 401 `UnauthorizedError` when the credential is missing or invalid.
 */
export function authenticate(
  deps: Pick<HttpDependencies, 'authService' | 'userRepository'>,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const bearer = extractBearerToken(req.header(AUTHORIZATION_HEADER));
      const apiKey = req.header(API_KEY_HEADER);

      if (bearer) {
        const identity = await deps.authService.verifyToken(bearer);
        const user = asUser(identity.user);
        req.tenantId = user.tenantId;
        req.userId = user._id;
        req.role = user.role;
        req.apiKeyId = null;
        req.userEmail = user.email;
        next();
        return;
      }

      if (apiKey) {
        const identity = await deps.authService.verifyApiKey(apiKey);
        const key = asApiKey(identity);
        const user = await deps.userRepository.findById(key.userId);
        req.tenantId = key.tenantId;
        req.userId = key.userId;
        req.role = user?.role ?? 'viewer';
        req.apiKeyId = key._id;
        req.userEmail = user?.email ?? '';
        next();
        return;
      }

      throw new UnauthorizedError();
    } catch (err) {
      next(err instanceof UnauthorizedError ? err : new UnauthorizedError());
    }
  };
}

/**
 * Builds a middleware that authorises a request based on the authenticated
 * role. Returns a 403 `ForbiddenError` when the caller's role is not among the
 * allowed roles. Must be used after `authenticate`.
 */
export function requirePermission(...allowedRoles: UserRole[]): RequestHandler {
  const allowed = new Set<UserRole>(allowedRoles);
  return (req, _res, next) => {
    if (!req.role || !allowed.has(req.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
