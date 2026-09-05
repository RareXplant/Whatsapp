import { Types, type Model } from 'mongoose';
import type { WebhookDelivery } from '../../../domain/entities/webhook-delivery.js';
import type {
  CreateWebhookDeliveryInput,
  UpdateWebhookDeliveryInput,
  WebhookDeliveryRepository,
} from '../../../domain/ports/webhook-delivery-repository.js';
import type { WebhookDeliveryDocument } from '../models/webhook-delivery.js';

interface WebhookDeliveryDocWithId extends WebhookDeliveryDocument {
  _id: unknown;
}

function toWebhookDelivery(doc: WebhookDeliveryDocWithId): WebhookDelivery {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    deliveryId: doc.deliveryId,
    event: doc.event,
    url: doc.url,
    payload: doc.payload,
    status: doc.status,
    statusCode: doc.statusCode,
    attempts: doc.attempts,
    lastAttemptAt: doc.lastAttemptAt,
    nextAttemptAt: doc.nextAttemptAt,
    response: doc.response,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoWebhookDeliveryRepository implements WebhookDeliveryRepository {
  constructor(private readonly webhookDeliveryModel: Model<WebhookDeliveryDocument>) {}

  async findById(id: string): Promise<WebhookDelivery | null> {
    const doc = await this.webhookDeliveryModel.findById(id).lean().exec();
    return doc === null ? null : toWebhookDelivery(doc);
  }

  async findByDeliveryId(deliveryId: string): Promise<WebhookDelivery | null> {
    const doc = await this.webhookDeliveryModel.findOne({ deliveryId }).lean().exec();
    return doc === null ? null : toWebhookDelivery(doc);
  }

  async findByTenantId(tenantId: string): Promise<WebhookDelivery[]> {
    const docs = await this.webhookDeliveryModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map(toWebhookDelivery);
  }

  async create(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    const doc = await this.webhookDeliveryModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      instanceId: input.instanceId,
      deliveryId: input.deliveryId,
      event: input.event,
      url: input.url,
      payload: input.payload,
      status: input.status as WebhookDeliveryDocument['status'],
      attempts: input.attempts ?? 0,
    });
    return toWebhookDelivery(doc);
  }

  async updateStatus(
    id: string,
    input: UpdateWebhookDeliveryInput,
  ): Promise<WebhookDelivery | null> {
    const doc = await this.webhookDeliveryModel
      .findByIdAndUpdate(id, input, { new: true })
      .lean()
      .exec();
    return doc === null ? null : toWebhookDelivery(doc);
  }

  async findPendingRetries(now: Date, limit: number): Promise<WebhookDelivery[]> {
    const docs = await this.webhookDeliveryModel
      .find({
        status: { $in: ['pending', 'retrying', 'failed'] },
        $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: null }],
      })
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map(toWebhookDelivery);
  }
}
