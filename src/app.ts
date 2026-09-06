import { createServer, type Server } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { Express } from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import {
  connectToMongo,
  disconnectFromMongo,
  checkMongoHealth,
} from './infrastructure/database/connection.js';
import { setActiveInstances, setConnectedInstances } from './infrastructure/metrics/metrics.js';
import {
  MongoTenantRepository,
  MongoUserRepository,
  MongoApiKeyRepository,
  MongoInstanceRepository,
  MongoMessageRepository,
  MongoWebhookDeliveryRepository,
  MongoAuditLogRepository,
  MongoAuthRepository,
  MongoInstanceLeaseRepository,
} from './infrastructure/database/repositories/index.js';
import {
  TenantModel,
  UserModel,
  ApiKeyModel,
  InstanceModel,
  MessageModel,
  WebhookDeliveryModel,
  AuditLogModel,
  AuthCredentialModel,
  AuthKeyModel,
  InstanceLeaseModel,
} from './infrastructure/database/models/index.js';
import { WhatsAppManager } from './infrastructure/baileys/WhatsAppManager.js';
import { WebhookDispatcher } from './infrastructure/webhooks/webhook-dispatcher.js';
import { LeaseManager } from './infrastructure/lease/lease-manager.js';
import { AuthService } from './application/services/auth.service.js';
import { InstanceService } from './application/services/instance.service.js';
import { MessageService } from './application/services/message.service.js';
import { WebhookService } from './application/services/webhook.service.js';
import { AuditService } from './application/services/audit.service.js';
import { StartupService } from './application/services/startup.service.js';
import { SocketService } from './interfaces/realtime/socket.service.js';
import { createApp } from './interfaces/http/app.js';
import type { HttpDependencies } from './interfaces/http/types/index.js';

export interface ApplicationContext {
  app: Express;
  server: Server;
  io: SocketIOServer;
  whatsAppManager: WhatsAppManager;
  socketService: SocketService;
  httpDeps: HttpDependencies;
  startupService: StartupService;
  webhookService: WebhookService;
}

/**
 * Bootstraps the entire application: connects MongoDB, wires repositories and
 * services, initializes the HTTP server + Socket.IO, and registers the
 * WhatsApp manager's runtime event forwarding.
 */
export async function createApplication(): Promise<ApplicationContext> {
  await connectToMongo();
  logger.info({ mongo: 'connected', dbName: config.MONGODB_DB_NAME }, 'database ready');

  const repositories = {
    tenant: new MongoTenantRepository(TenantModel),
    user: new MongoUserRepository(UserModel),
    apiKey: new MongoApiKeyRepository(ApiKeyModel),
    instance: new MongoInstanceRepository(InstanceModel),
    message: new MongoMessageRepository(MessageModel),
    webhookDelivery: new MongoWebhookDeliveryRepository(WebhookDeliveryModel),
    auditLog: new MongoAuditLogRepository(AuditLogModel),
    auth: new MongoAuthRepository(AuthCredentialModel, AuthKeyModel),
    instanceLease: new MongoInstanceLeaseRepository(InstanceLeaseModel),
  };

  const webhookDispatcher = new WebhookDispatcher({
    repository: repositories.webhookDelivery,
    getWebhookSecret: async (tenantId, instanceId) => {
      const instance = await repositories.instance.findByInstanceId(instanceId);
      if (!instance || instance.tenantId !== tenantId) return null;
      return instance.webhookSecret;
    },
  });
  const auditService = new AuditService({ auditLogRepository: repositories.auditLog });
  const authService = new AuthService({
    userRepository: repositories.user,
    apiKeyRepository: repositories.apiKey,
    tenantRepository: repositories.tenant,
  });

  const socketService = new SocketService({
    authService,
    instanceRepository: repositories.instance,
  });

  const sendRuntimeEvent = (event: string, payload: Record<string, unknown>): void => {
    const instanceId = payload.instanceId;
    if (typeof instanceId !== 'string' || instanceId.length === 0) return;

    void (async () => {
      const instance = await repositories.instance.findByInstanceId(instanceId);
      if (instance) {
        socketService.emitToTenant(instance.tenantId, event, payload);
        await updateInstanceStatusFromEvent(instance, event, payload);
      }
    })().catch((err: unknown) => {
      logger.error({ err, event, instanceId }, 'failed to forward runtime event to socket.io');
    });
  };

  async function updateInstanceStatusFromEvent(
    instance: { _id: string; instanceId: string },
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    switch (event) {
      case 'instance.qr':
        await repositories.instance.updateStatus(instance._id, 'qr_ready');
        break;
      case 'instance.pairingCode':
        await repositories.instance.updateStatus(instance._id, 'connecting');
        break;
      case 'instance.connected':
        await repositories.instance.updateStatus(instance._id, 'connected');
        if (typeof payload.phoneNumber === 'string') {
          await repositories.instance.update(instance._id, {
            lastConnectedAt: now,
            phoneNumber: payload.phoneNumber,
            pushName: typeof payload.pushName === 'string' ? payload.pushName : undefined,
          });
        }
        break;
      case 'instance.disconnected':
        await repositories.instance.updateStatus(instance._id, 'disconnected');
        await repositories.instance.update(instance._id, { lastDisconnectedAt: now });
        break;
      case 'instance.loggedOut':
        await repositories.instance.updateStatus(instance._id, 'logged_out');
        break;
    }

    try {
      setActiveInstances(whatsAppManager.getAllInstances().length);
      setConnectedInstances(
        whatsAppManager.getAllInstances().filter((i) => i.transport.isConnected()).length,
      );
    } catch {
      // Metrics are best-effort; ignore failures.
    }
  }

  const messageService = new MessageService({
    messageRepository: repositories.message,
    instanceRepository: repositories.instance,
    getRuntimeInstance: () => undefined,
    webhookDispatcher,
    sendRuntimeEvent,
  });

  const whatsAppManager = new WhatsAppManager({
    authRepository: repositories.auth,
    sendRuntimeEvent,
    onMessageReceived: (payload) => messageService.handleIncomingMessage(payload),
    onMessageUpdated: (payload) => messageService.handleMessageUpdate(payload),
    getMessageFactory: (tenantId, instanceId) => {
      return messageService.createGetMessage(tenantId, instanceId);
    },
  });

  // Wire messageService to actual runtime instances
  messageService.setRuntimeProvider((instanceId) => {
    return whatsAppManager.getInstance(instanceId);
  });

  const instanceService = new InstanceService({
    instanceRepository: repositories.instance,
    whatsAppManager,
    webhookDispatcher,
  });

  const webhookService = new WebhookService({
    instanceRepository: repositories.instance,
    webhookDispatcher,
    webhookDeliveryRepository: repositories.webhookDelivery,
  });
  webhookService.start();

  const httpDeps: HttpDependencies = {
    logger,
    authService,
    instanceService,
    messageService,
    auditService,
    tenantRepository: repositories.tenant,
    userRepository: repositories.user,
    apiKeyRepository: repositories.apiKey,
    auditLogRepository: repositories.auditLog,
    whatsAppManager,
  };

  const app = createApp(httpDeps);
  const server = createServer(app);

  const io = socketService.init(server);

  const startupService = new StartupService({
    instanceRepository: repositories.instance,
    authRepository: repositories.auth,
    whatsAppManager,
    leaseManager: new LeaseManager({ leasePort: repositories.instanceLease }),
  });

  return {
    app,
    server,
    io,
    whatsAppManager,
    socketService,
    httpDeps,
    startupService,
    webhookService,
  };
}

export async function shutdownApplication(context: ApplicationContext): Promise<void> {
  logger.info('shutting down application');
  context.webhookService.stop();
  await context.startupService.shutdown();
  await context.whatsAppManager.shutdown();
  context.socketService.shutdown();
  await disconnectFromMongo();
  logger.info('shutdown complete');
}

export function isMongoHealthy(): boolean {
  return checkMongoHealth().connected;
}
