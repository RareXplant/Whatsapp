import type {
  TenantRepository,
  UserRepository,
  ApiKeyRepository,
  AuditLogRepository,
} from '../../../domain/ports/index.js';
import type { Logger } from '../../../logger.js';
import type {
  AuthService,
  InstanceService,
  MessageService,
  AuditService,
} from '../../../application/services/index.js';
import type { WhatsAppManager } from '../../../infrastructure/baileys/WhatsAppManager.js';

/**
 * Returns the full dependency collection available to the HTTP interface layer.
 * Application services and repositories are injected so that routers and
 * middleware are easy to unit test.
 */
export interface HttpDependencies {
  logger: Logger;
  authService: AuthService;
  instanceService: InstanceService;
  messageService: MessageService;
  auditService: AuditService;
  tenantRepository: TenantRepository;
  userRepository: UserRepository;
  apiKeyRepository: ApiKeyRepository;
  auditLogRepository: AuditLogRepository;
  whatsAppManager: WhatsAppManager;
}
