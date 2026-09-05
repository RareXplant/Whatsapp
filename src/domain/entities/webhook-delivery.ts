export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying' | 'dead';

export interface WebhookDelivery {
  _id: string;
  tenantId: string;
  instanceId: string;
  deliveryId: string;
  event: string;
  url: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  attempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  response: string | null;
  createdAt: Date;
  updatedAt: Date;
}
