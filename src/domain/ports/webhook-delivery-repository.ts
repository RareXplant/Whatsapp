import type { WebhookDelivery, WebhookDeliveryStatus } from '../entities/index.js';

export interface CreateWebhookDeliveryInput {
  tenantId: string;
  instanceId: string;
  deliveryId: string;
  event: string;
  url: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts?: number;
}

export interface UpdateWebhookDeliveryInput {
  status?: WebhookDeliveryStatus;
  statusCode?: number | null;
  attempts?: number;
  lastAttemptAt?: Date | null;
  nextAttemptAt?: Date | null;
  response?: string | null;
}

export interface WebhookDeliveryRepository {
  findById(id: string): Promise<WebhookDelivery | null>;
  findByDeliveryId(deliveryId: string): Promise<WebhookDelivery | null>;
  findByTenantId(tenantId: string): Promise<WebhookDelivery[]>;
  create(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery>;
  updateStatus(id: string, input: UpdateWebhookDeliveryInput): Promise<WebhookDelivery | null>;
  findPendingRetries(now: Date, limit: number): Promise<WebhookDelivery[]>;
}
