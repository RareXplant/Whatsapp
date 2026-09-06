import { Router, type RequestHandler } from 'express';
import type { Instance, UserRole } from '../../../domain/entities/index.js';
import { createSuccessResponse } from '../../../shared/utils/index.js';
import { ConflictError } from '../../../shared/errors/index.js';
import {
  createInstanceSchema,
  webhookSchema,
  requestPairingSchema,
  chatHistoryQuerySchema,
} from '../schemas/index.js';
import { validateBody, validateQuery } from '../utils/validate.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRouteParam } from '../utils/params.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import type { HttpDependencies } from '../types/index.js';

function asInstance(value: unknown): Instance {
  return value as Instance;
}

function toInstanceDto(instance: Instance): Record<string, unknown> {
  return {
    id: instance._id,
    instanceId: instance.instanceId,
    name: instance.name,
    status: instance.status,
    phoneNumber: instance.phoneNumber,
    pushName: instance.pushName,
    profilePictureUrl: instance.profilePictureUrl,
    platform: instance.platform,
    connectionState: instance.connectionState,
    webhookUrl: instance.webhookUrl,
    pairingCode: instance.pairingCode,
    pairingPhoneNumber: instance.pairingPhoneNumber,
    lastConnectedAt: instance.lastConnectedAt,
    lastDisconnectedAt: instance.lastDisconnectedAt,
    lastErrorAt: instance.lastErrorAt,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

/**
 * Instance lifecycle, WhatsApp connection and webhook configuration routes.
 */
export function createInstanceRouter(deps: HttpDependencies): Router {
  const router = Router();
  const { instanceService, auditService, whatsAppManager } = deps;

  const operatorRoles: UserRole[] = ['owner', 'admin', 'operator'];
  const ownerRoles: UserRole[] = ['owner', 'admin'];

  const createInstance: RequestHandler = async (req, res, next) => {
    try {
      const input = validateBody(createInstanceSchema, req);
      const result = await instanceService.createInstance(req.tenantId, req.userId, {
        name: input.name,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecret: input.webhookSecret ?? null,
        usePairingCode: input.usePairingCode ?? false,
        phoneNumber: input.phoneNumber ?? null,
      });
      const instance = asInstance(result);
      await writeAuditLog(
        auditService,
        req,
        'instance.create',
        'instance',
        instance.instanceId,
        'success',
        {
          name: input.name,
          usePairingCode: input.usePairingCode ?? false,
        },
      );

      if (input.usePairingCode && input.phoneNumber) {
        const fresh = asInstance(
          await instanceService.getInstance(req.tenantId, instance.instanceId),
        );
        res.status(201).json(
          createSuccessResponse(
            {
              instance: toInstanceDto(fresh),
              pairingCode: fresh.pairingCode,
              pairingPhoneNumber: fresh.pairingPhoneNumber,
            },
            req.requestId,
          ),
        );
        return;
      }

      const runtimeQr = whatsAppManager.getInstance(instance.instanceId)?.lastQr ?? null;
      res.status(201).json(
        createSuccessResponse(
          {
            instance: toInstanceDto(instance),
            qr: runtimeQr,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  const listInstances: RequestHandler = async (req, res, next) => {
    try {
      const instances = await instanceService.listInstances(req.tenantId);
      res.status(200).json(
        createSuccessResponse(
          instances.map((raw: unknown) => toInstanceDto(asInstance(raw))),
          req.requestId,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  const getInstance: RequestHandler = async (req, res, next) => {
    try {
      const instance = await instanceService.getInstance(req.tenantId, getRouteParam(req, 'id'));
      res
        .status(200)
        .json(
          createSuccessResponse({ instance: toInstanceDto(asInstance(instance)) }, req.requestId),
        );
    } catch (err) {
      next(err);
    }
  };

  const getQr: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const instance = asInstance(await instanceService.getInstance(req.tenantId, instanceId));
      const { qr } = await instanceService.getQr(req.tenantId, instanceId);
      if (!qr) {
        throw new ConflictError('No QR code is currently available for this instance');
      }
      res
        .status(200)
        .json(createSuccessResponse({ qr, instanceId: instance.instanceId }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const getQrStatus: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const instance = asInstance(await instanceService.getInstance(req.tenantId, instanceId));
      const connected = whatsAppManager.isRunning(instanceId);
      res
        .status(200)
        .json(
          createSuccessResponse({ instanceId, status: instance.status, connected }, req.requestId),
        );
    } catch (err) {
      next(err);
    }
  };

  const requestPairing: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const input = validateBody(requestPairingSchema, req);
      const pairingCode = await instanceService.requestPairingCode(
        req.tenantId,
        instanceId,
        input.phoneNumber,
      );
      await writeAuditLog(auditService, req, 'instance.pairing', 'instance', instanceId, 'success');
      res
        .status(200)
        .json(
          createSuccessResponse({ pairingCode, phoneNumber: input.phoneNumber }, req.requestId),
        );
    } catch (err) {
      next(err);
    }
  };

  const disconnectInstance: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      await instanceService.disconnectInstance(req.tenantId, instanceId);
      await writeAuditLog(
        auditService,
        req,
        'instance.disconnect',
        'instance',
        instanceId,
        'success',
      );
      res.status(200).json(createSuccessResponse({ disconnected: true }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const reconnectInstance: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      await instanceService.reconnectInstance(req.tenantId, instanceId);
      await writeAuditLog(
        auditService,
        req,
        'instance.reconnect',
        'instance',
        instanceId,
        'success',
      );
      res.status(200).json(createSuccessResponse({ reconnected: true, instanceId }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const logoutInstance: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      await instanceService.logoutInstance(req.tenantId, instanceId);
      await writeAuditLog(auditService, req, 'instance.logout', 'instance', instanceId, 'success');
      res.status(200).json(createSuccessResponse({ loggedOut: true, instanceId }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const deleteInstance: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      await instanceService.deleteInstance(req.tenantId, instanceId);
      await writeAuditLog(auditService, req, 'instance.delete', 'instance', instanceId, 'success');
      res.status(200).json(createSuccessResponse({ deleted: true, instanceId }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const listChats: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const chats = await instanceService.getChats(req.tenantId, instanceId);
      res.status(200).json(createSuccessResponse({ chats }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const listGroups: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const groups = await instanceService.getGroups(req.tenantId, instanceId);
      res.status(200).json(createSuccessResponse({ groups }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const getChatHistory: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const jid = String(req.params.jid);
      const query = validateQuery(chatHistoryQuerySchema, req);
      const result = await deps.messageService.getChatHistory(
        req.tenantId,
        instanceId,
        jid,
        query.limit ?? 50,
        query.cursor,
      );
      res.status(200).json(createSuccessResponse(result, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const getWebhook: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const instance = asInstance(await instanceService.getInstance(req.tenantId, instanceId));
      res
        .status(200)
        .json(
          createSuccessResponse(
            { webhookUrl: instance.webhookUrl, hasSecret: instance.webhookSecret !== null },
            req.requestId,
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  const updateWebhook: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      const input = validateBody(webhookSchema, req);
      await instanceService.updateWebhook(req.tenantId, instanceId, {
        webhookUrl: input.webhookUrl,
        webhookSecret: input.webhookSecret ?? null,
      });
      await writeAuditLog(
        auditService,
        req,
        'instance.webhook.update',
        'instance',
        instanceId,
        'success',
        {
          webhookUrl: input.webhookUrl,
        },
      );
      res.status(200).json(createSuccessResponse({ updated: true }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  const testWebhook: RequestHandler = async (req, res, next) => {
    try {
      const instanceId = getRouteParam(req, 'id');
      await instanceService.testWebhook(req.tenantId, instanceId);
      await writeAuditLog(
        auditService,
        req,
        'instance.webhook.test',
        'instance',
        instanceId,
        'success',
      );
      res
        .status(200)
        .json(
          createSuccessResponse(
            { tested: true, message: 'test webhook dispatched' },
            req.requestId,
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  router.post(
    '/instances',
    authenticate(deps),
    requirePermission(...operatorRoles),
    createInstance,
  );
  router.get('/instances', authenticate(deps), listInstances);
  router.get('/instances/:id', authenticate(deps), getInstance);
  router.get('/instances/:id/qr', authenticate(deps), getQr);
  router.get('/instances/:id/qr/status', authenticate(deps), getQrStatus);
  router.post(
    '/instances/:id/pairing',
    authenticate(deps),
    requirePermission(...operatorRoles),
    requestPairing,
  );
  router.post(
    '/instances/:id/disconnect',
    authenticate(deps),
    requirePermission(...operatorRoles),
    disconnectInstance,
  );
  router.post(
    '/instances/:id/reconnect',
    authenticate(deps),
    requirePermission(...operatorRoles),
    reconnectInstance,
  );
  router.post(
    '/instances/:id/logout',
    authenticate(deps),
    requirePermission(...ownerRoles),
    logoutInstance,
  );
  router.delete(
    '/instances/:id',
    authenticate(deps),
    requirePermission(...ownerRoles),
    deleteInstance,
  );
  router.get('/instances/:id/chats', authenticate(deps), listChats);
  router.get('/instances/:id/chats/:jid/messages', authenticate(deps), getChatHistory);
  router.get('/instances/:id/groups', authenticate(deps), listGroups);
  router.get('/instances/:id/webhook', authenticate(deps), getWebhook);
  router.put(
    '/instances/:id/webhook',
    authenticate(deps),
    requirePermission(...operatorRoles),
    updateWebhook,
  );
  router.post(
    '/instances/:id/webhook/test',
    authenticate(deps),
    requirePermission(...operatorRoles),
    testWebhook,
  );

  return router;
}
