import { Router, type RequestHandler } from 'express';
import type { User, UserRole, ApiKey } from '../../../domain/entities/index.js';
import { createSuccessResponse } from '../../../shared/utils/index.js';
import { NotFoundError } from '../../../shared/errors/index.js';
import { loginSchema, createApiKeySchema } from '../schemas/index.js';
import { validateBody } from '../utils/validate.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRouteParam } from '../utils/params.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { strictRateLimitMiddleware } from '../middleware/rate-limit.js';
import type { HttpDependencies } from '../types/index.js';

function asUser(value: unknown): User {
  return value as User;
}

function asApiKey(value: unknown): ApiKey {
  return value as ApiKey;
}

/**
 * Authentication and API-key management routes mounted at `/auth`.
 */
export function createAuthRouter(deps: HttpDependencies): Router {
  const router = Router();
  const { authService, auditService, userRepository, tenantRepository } = deps;

  const login: RequestHandler = async (req, res, next) => {
    try {
      const input = validateBody(loginSchema, req);
      const result = await authService.login(input.email, input.password);
      const user = asUser(result.user);
      const tenant = await tenantRepository.findById(user.tenantId);
      req.tenantId = user.tenantId;
      req.userId = user._id;
      req.role = user.role;
      req.userEmail = user.email;
      await writeAuditLog(auditService, req, 'auth.login', 'user', user._id, 'success');
      res.status(200).json(
        createSuccessResponse(
          {
            token: result.token,
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
            tenant: tenant ? { id: tenant._id, name: tenant.name, slug: tenant.slug } : null,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      await writeAuditLog(auditService, req, 'auth.login', 'user', null, 'failure');
      next(err);
    }
  };

  const me: RequestHandler = async (req, res, next) => {
    try {
      const user = await userRepository.findById(req.userId);
      if (user === null) {
        throw new NotFoundError('User', req.userId);
      }
      const tenant = await tenantRepository.findById(user.tenantId);
      res.status(200).json(
        createSuccessResponse(
          {
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
            tenant: tenant ? { id: tenant._id, name: tenant.name, slug: tenant.slug } : null,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  const createApiKey: RequestHandler = async (req, res, next) => {
    try {
      const input = validateBody(createApiKeySchema, req);
      const result = await authService.createApiKey(
        req.tenantId,
        req.userId,
        input.name,
        input.scopes ?? ['*'],
      );
      const apiKey = asApiKey(result.apiKey);
      await writeAuditLog(auditService, req, 'api_key.create', 'api_key', apiKey._id, 'success', {
        name: input.name,
        keyPrefix: apiKey.keyPrefix,
      });
      res.status(201).json(
        createSuccessResponse(
          {
            id: apiKey._id,
            name: apiKey.name,
            scopes: apiKey.scopes,
            keyPrefix: apiKey.keyPrefix,
            plaintextKey: result.plaintextKey,
            createdAt: apiKey.createdAt,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  const listApiKeys: RequestHandler = async (req, res, next) => {
    try {
      const keys = await authService.listApiKeys(req.tenantId);
      const payload = keys.map((rawKey: unknown) => {
        const apiKey = asApiKey(rawKey);
        return {
          id: apiKey._id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
          lastUsedAt: apiKey.lastUsedAt,
          createdAt: apiKey.createdAt,
        };
      });
      res.status(200).json(createSuccessResponse(payload, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const deleteApiKey: RequestHandler = async (req, res, next) => {
    try {
      const keyId = getRouteParam(req, 'id');
      await authService.deleteApiKey(req.tenantId, keyId);
      await writeAuditLog(auditService, req, 'api_key.delete', 'api_key', keyId, 'success');
      res.status(200).json(createSuccessResponse({ deleted: true }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const ownerAdmin: UserRole[] = ['owner', 'admin'];

  router.post('/auth/login', strictRateLimitMiddleware(), login);
  router.get('/auth/me', authenticate(deps), me);
  router.post('/auth/api-keys', authenticate(deps), requirePermission(...ownerAdmin), createApiKey);
  router.get('/auth/api-keys', authenticate(deps), listApiKeys);
  router.delete(
    '/auth/api-keys/:id',
    authenticate(deps),
    requirePermission(...ownerAdmin),
    deleteApiKey,
  );

  return router;
}
