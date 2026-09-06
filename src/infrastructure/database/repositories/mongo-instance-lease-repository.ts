import { Types, type Model } from 'mongoose';
import type { InstanceLease } from '../../../domain/entities/instance-lease.js';
import type { InstanceLeasePort } from '../../../domain/ports/instance-lease.js';
import type { InstanceLeaseDocument } from '../models/instance-lease.js';

interface InstanceLeaseDocWithId extends InstanceLeaseDocument {
  _id: unknown;
}

function toInstanceLease(doc: InstanceLeaseDocWithId): InstanceLease {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    ownerId: doc.ownerId,
    leaseUntil: doc.leaseUntil,
    heartbeatAt: doc.heartbeatAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoInstanceLeaseRepository implements InstanceLeasePort {
  constructor(private readonly model: Model<InstanceLeaseDocument>) {}

  async acquire(
    tenantId: string,
    instanceId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<InstanceLease | null> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + ttlMs);

    // Try to create a new lease if none exists or the existing one is expired.
    const result = await this.model
      .findOneAndUpdate(
        {
          tenantId: new Types.ObjectId(tenantId),
          instanceId,
          $or: [{ leaseUntil: { $lte: now } }, { ownerId }],
        },
        {
          $set: {
            ownerId,
            leaseUntil,
            heartbeatAt: now,
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();

    return result === null ? null : toInstanceLease(result);
  }

  async renew(
    tenantId: string,
    instanceId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + ttlMs);

    const result = await this.model
      .updateOne(
        {
          tenantId: new Types.ObjectId(tenantId),
          instanceId,
          ownerId,
          leaseUntil: { $gt: now },
        },
        {
          $set: {
            leaseUntil,
            heartbeatAt: now,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async release(tenantId: string, instanceId: string, ownerId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({
        tenantId: new Types.ObjectId(tenantId),
        instanceId,
        ownerId,
      })
      .exec();

    return result.deletedCount === 1;
  }

  async findByInstance(tenantId: string, instanceId: string): Promise<InstanceLease | null> {
    const doc = await this.model
      .findOne({ tenantId: new Types.ObjectId(tenantId), instanceId })
      .lean()
      .exec();

    return doc === null ? null : toInstanceLease(doc);
  }
}
