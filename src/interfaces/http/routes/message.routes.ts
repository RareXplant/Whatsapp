import { Router, type RequestHandler } from 'express';
import { createSuccessResponse } from '../../../shared/utils/index.js';
import { sendMessageSchema } from '../schemas/index.js';
import { validateBody } from '../utils/validate.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRouteParam } from '../utils/params.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import type { HttpDependencies } from '../types/index.js';
import type { UserRole } from '../../../domain/entities/index.js';

/**
 * Message sending routes. Both `/instances/:id/messages/text` and the
 * compatibility endpoint `/messages/:id/send` are supported.
 */
export function createMessageRouter(deps: HttpDependencies): Router {
  const router = Router();
  const { messageService, auditService } = deps;

  const operatorRoles: UserRole[] = ['owner', 'admin', 'operator'];

  const sendText: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const input = validateBody(sendMessageSchema, req);
      const result = await messageService.sendText(req.tenantId, instanceId, {
        to: input.to,
        text: input.text,
      });
      await writeAuditLog(auditService, req, 'message.send', 'instance', instanceId, 'success', {
        to: input.to,
        messageType: 'text',
      });
      res
        .status(200)
        .json(createSuccessResponse({ messageId: result.messageId, instanceId }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  router.post(
    '/instances/:id/messages/text',
    authenticate(deps),
    requirePermission(...operatorRoles),
    sendText,
  );
  router.post(
    '/messages/:id/send',
    authenticate(deps),
    requirePermission(...operatorRoles),
    sendText,
  );

  return router;
}
