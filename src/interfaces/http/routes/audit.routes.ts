import { Router, type RequestHandler } from 'express';
import type { AuditLog, UserRole } from '../../../domain/entities/index.js';
import { createSuccessResponse } from '../../../shared/utils/index.js';
import { auditQuerySchema } from '../schemas/index.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import type { HttpDependencies } from '../types/index.js';

/**
 * Audit log query routes, restricted to owner/admin roles.
 */
export function createAuditRouter(deps: HttpDependencies): Router {
  const router = Router();
  const { auditLogRepository } = deps;

  const ownerRoles: UserRole[] = ['owner', 'admin'];

  const listAudit: RequestHandler = async (req, res, next) => {
    try {
      const parsed = auditQuerySchema.safeParse(req.query);
      const query = parsed.success ? parsed.data : {};

      let entries: AuditLog[];
      if (query.instanceId) {
        entries = await auditLogRepository.findByInstanceId(query.instanceId);
      } else {
        entries = await auditLogRepository.findByTenantId(req.tenantId);
      }

      const filtered = entries
        .filter((entry) => entry.tenantId === req.tenantId)
        .filter((entry) => (query.action ? entry.action === query.action : true))
        .slice(0, query.limit ?? 50)
        .map((entry) => ({
          id: entry._id,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          userId: entry.userId,
          apiKeyId: entry.apiKeyId,
          timestamp: entry.timestamp,
          result: entry.result,
          details: entry.details,
        }));

      res
        .status(200)
        .json(createSuccessResponse({ entries: filtered, count: filtered.length }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  router.get('/audit', authenticate(deps), requirePermission(...ownerRoles), listAudit);

  return router;
}
