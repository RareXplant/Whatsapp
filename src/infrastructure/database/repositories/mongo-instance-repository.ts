import { Types, type Model } from 'mongoose';
import type { Instance, InstanceStatus } from '../../../domain/entities/instance.js';
import type {
  CreateInstanceInput,
  InstanceRepository,
  UpdateInstanceInput,
} from '../../../domain/ports/instance-repository.js';
import type { InstanceDocument } from '../models/instance.js';

interface InstanceDocWithId extends InstanceDocument {
  _id: unknown;
}

function toInstance(doc: InstanceDocWithId): Instance {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    name: doc.name,
    status: doc.status,
    phoneNumber: doc.phoneNumber,
    pushName: doc.pushName,
    profilePictureUrl: doc.profilePictureUrl,
    platform: doc.platform,
    connectionState: doc.connectionState,
    lastQr: doc.lastQr,
    pairingCode: doc.pairingCode,
    pairingPhoneNumber: doc.pairingPhoneNumber,
    webhookUrl: doc.webhookUrl,
    webhookSecret: doc.webhookSecret,
    lastConnectedAt: doc.lastConnectedAt,
    lastDisconnectedAt: doc.lastDisconnectedAt,
    lastErrorAt: doc.lastErrorAt,
    reconnectAttempts: doc.reconnectAttempts,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoInstanceRepository implements InstanceRepository {
  constructor(private readonly instanceModel: Model<InstanceDocument>) {}

  async findById(id: string): Promise<Instance | null> {
    const doc = await this.instanceModel.findById(id).lean().exec();
    return doc === null ? null : toInstance(doc);
  }

  async findByInstanceId(instanceId: string): Promise<Instance | null> {
    const doc = await this.instanceModel.findOne({ instanceId }).lean().exec();
    return doc === null ? null : toInstance(doc);
  }

  async findByTenantId(tenantId: string): Promise<Instance[]> {
    const docs = await this.instanceModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean()
      .exec();
    return docs.map(toInstance);
  }

  async findAll(): Promise<Instance[]> {
    const docs = await this.instanceModel.find().lean().exec();
    return docs.map(toInstance);
  }

  async create(input: CreateInstanceInput): Promise<Instance> {
    const doc = await this.instanceModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      instanceId: input.instanceId,
      name: input.name,
      status: input.status,
      phoneNumber: input.phoneNumber ?? null,
      pushName: input.pushName ?? null,
      profilePictureUrl: input.profilePictureUrl ?? null,
      platform: input.platform ?? null,
      connectionState: input.connectionState ?? null,
      lastQr: input.lastQr ?? null,
      pairingCode: input.pairingCode ?? null,
      pairingPhoneNumber: input.pairingPhoneNumber ?? null,
      webhookUrl: input.webhookUrl ?? null,
      webhookSecret: input.webhookSecret ?? null,
    });
    return toInstance(doc);
  }

  async update(id: string, input: UpdateInstanceInput): Promise<Instance | null> {
    const doc = await this.instanceModel.findByIdAndUpdate(id, input, { new: true }).lean().exec();
    return doc === null ? null : toInstance(doc);
  }

  async updateStatus(id: string, status: InstanceStatus): Promise<Instance | null> {
    const doc = await this.instanceModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .lean()
      .exec();
    return doc === null ? null : toInstance(doc);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.instanceModel.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.instanceModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) }).exec();
  }
}
