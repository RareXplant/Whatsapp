import { logger } from '../../src/logger.js';
import {
  WhatsAppManager,
  type TransportFactory,
} from '../../src/infrastructure/baileys/WhatsAppManager.js';
import { WebhookDispatcher } from '../../src/infrastructure/webhooks/webhook-dispatcher.js';
import { AuthService } from '../../src/application/services/auth.service.js';
import { InstanceService } from '../../src/application/services/instance.service.js';
import { MessageService } from '../../src/application/services/message.service.js';
import { AuditService } from '../../src/application/services/audit.service.js';
import { createApp } from '../../src/interfaces/http/app.js';
import type { HttpDependencies } from '../../src/interfaces/http/types/index.js';
import {
  InMemoryApiKeyRepository,
  InMemoryAuditLogRepository,
  InMemoryAuthRepository,
  InMemoryInstanceRepository,
  InMemoryMessageRepository,
  InMemoryTenantRepository,
  InMemoryUserRepository,
  InMemoryWebhookDeliveryRepository,
} from '../mocks/repositories.js';
import { FakeTransport } from '../mocks/fake-transport.js';

export interface TestHarnessOptions {
  seedInstances?: unknown[];
  useMongo?: boolean;
}

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  deps: HttpDependencies;
  tenantRepository: InMemoryTenantRepository;
  userRepository: InMemoryUserRepository;
  apiKeyRepository: InMemoryApiKeyRepository;
  instanceRepository: InMemoryInstanceRepository;
  messageRepository: InMemoryMessageRepository;
  webhookDeliveryRepository: InMemoryWebhookDeliveryRepository;
  auditLogRepository: InMemoryAuditLogRepository;
  authRepository: InMemoryAuthRepository;
  authService: AuthService;
  instanceService: InstanceService;
  messageService: MessageService;
  auditService: AuditService;
  whatsAppManager: WhatsAppManager;
  getInstanceRuntime: (instanceId: string) => unknown;
}

/**
 * Builds a fully wired application against in-memory repositories and a fake
 * WhatsApp transport. Use this in API integration tests to avoid any real
 * Baileys network traffic.
 */
export function createTestHarness(options: TestHarnessOptions = {}): TestHarness {
  const tenantRepository = new InMemoryTenantRepository();
  const userRepository = new InMemoryUserRepository();
  const apiKeyRepository = new InMemoryApiKeyRepository();
  const instanceRepository = new InMemoryInstanceRepository(options.seedInstances as never[]);
  const messageRepository = new InMemoryMessageRepository();
  const webhookDeliveryRepository = new InMemoryWebhookDeliveryRepository();
  const auditLogRepository = new InMemoryAuditLogRepository();
  const authRepository = new InMemoryAuthRepository();

  const webhookDispatcher = new WebhookDispatcher({
    repository: webhookDeliveryRepository,
    getWebhookSecret: async (tenantId, instanceId) => {
      const instance = await instanceRepository.findByInstanceId(instanceId);
      if (!instance || instance.tenantId !== tenantId) return null;
      return instance.webhookSecret;
    },
    timeoutMs: 500,
    maxRetries: 1,
    baseRetryMs: 5,
    maxRetryMs: 10,
    logger,
  });

  const auditService = new AuditService({ auditLogRepository });
  const authService = new AuthService({
    userRepository,
    apiKeyRepository,
    tenantRepository,
    logger,
  });

  const runtimeInstances = new Map<string, FakeTransport>();
  const transportFactory: TransportFactory = (opts) => {
    const transport = new FakeTransport({
      tenantId: opts.tenantId,
      instanceId: opts.instanceId,
    });
    runtimeInstances.set(opts.instanceId, transport);
    return transport as unknown as never;
  };
  const whatsAppManager = new WhatsAppManager({
    authRepository,
    logger,
    transportFactory,
    sendRuntimeEvent: () => undefined,
  });

  const messageService = new MessageService({
    messageRepository,
    instanceRepository,
    getRuntimeInstance: () => undefined,
    webhookDispatcher,
    sendRuntimeEvent: () => undefined,
    logger,
  });
  messageService.setRuntimeProvider((instanceId) => {
    return whatsAppManager.getInstance(instanceId);
  });

  const instanceService = new InstanceService({
    instanceRepository,
    whatsAppManager,
    webhookDispatcher,
    logger,
  });

  const deps: HttpDependencies = {
    logger,
    authService,
    instanceService,
    messageService,
    auditService,
    tenantRepository,
    userRepository,
    apiKeyRepository,
    auditLogRepository,
    whatsAppManager,
  };

  const app = createApp(deps);

  return {
    app,
    deps,
    tenantRepository,
    userRepository,
    apiKeyRepository,
    instanceRepository,
    messageRepository,
    webhookDeliveryRepository,
    auditLogRepository,
    authRepository,
    authService,
    instanceService,
    messageService,
    auditService,
    whatsAppManager,
    getInstanceRuntime: (instanceId) => runtimeInstances.get(instanceId) ?? null,
  };
}
