import { Schema, model, SchemaTypes } from 'mongoose';

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'success', 'failed', 'retrying'] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export interface WebhookDeliveryDocument {
  tenantId: Schema.Types.ObjectId;
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

const webhookDeliverySchema = new Schema<WebhookDeliveryDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true },
    deliveryId: { type: String, required: true },
    event: { type: String, required: true },
    url: { type: String, required: true },
    payload: { type: SchemaTypes.Mixed, default: {} },
    status: { type: String, enum: WEBHOOK_DELIVERY_STATUSES, default: 'pending' },
    statusCode: { type: Number, default: null },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
    response: { type: String, default: null },
  },
  {
    collection: 'webhookdeliveries',
    timestamps: true,
  },
);

webhookDeliverySchema.set('strict', true);

webhookDeliverySchema.index({ deliveryId: 1 }, { unique: true });
webhookDeliverySchema.index({ tenantId: 1 });
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

export const WebhookDeliveryModel = model<WebhookDeliveryDocument>(
  'WebhookDelivery',
  webhookDeliverySchema,
);
