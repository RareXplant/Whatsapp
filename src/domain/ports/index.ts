export type { TenantRepository } from './tenant-repository.js';
export type { UserRepository, CreateUserInput, UpdateUserInput } from './user-repository.js';
export type { ApiKeyRepository, CreateApiKeyInput } from './api-key-repository.js';
export type {
  InstanceRepository,
  CreateInstanceInput,
  UpdateInstanceInput,
} from './instance-repository.js';
export type { MessageRepository, CreateMessageInput } from './message-repository.js';
export type {
  WebhookDeliveryRepository,
  CreateWebhookDeliveryInput,
  UpdateWebhookDeliveryInput,
} from './webhook-delivery-repository.js';
export type { AuditLogRepository, CreateAuditLogInput } from './audit-log-repository.js';
export type { AuthRepository } from './auth-repository.js';
export type {
  WhatsAppTransport,
  WhatsAppTransportEventMap,
  WhatsAppQrPayload,
  WhatsAppPairingCodePayload,
  WhatsAppConnectedPayload,
  WhatsAppDisconnectedPayload,
  WhatsAppLoggedOutPayload,
  WhatsAppMessageReceivedPayload,
  WhatsAppMessageUpdatedPayload,
  WhatsAppCredentialsUpdatedPayload,
} from './whatsapp-transport.js';
export type { MediaStoragePort, StoredMedia } from './media-storage.js';
export type { WebhookDispatcherPort } from './webhook-dispatcher.js';

export type { CreateTenantInput, UpdateTenantInput } from './tenant-repository.js';
