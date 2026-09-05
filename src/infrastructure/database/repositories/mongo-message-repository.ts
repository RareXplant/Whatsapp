import { Types, type Model } from 'mongoose';
import type { Message } from '../../../domain/entities/message.js';
import type {
  CreateMessageInput,
  MessageRepository,
  UpdateMessageStatusInput,
} from '../../../domain/ports/message-repository.js';
import type { MessageDocument } from '../models/message.js';

interface MessageDocWithId extends MessageDocument {
  _id: unknown;
}

function toMessage(doc: MessageDocWithId): Message {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    messageId: doc.messageId,
    remoteJid: doc.remoteJid,
    participant: doc.participant,
    fromMe: doc.fromMe,
    direction: doc.direction,
    timestamp: doc.timestamp,
    messageType: doc.messageType,
    text: doc.text,
    rawMessage: doc.rawMessage,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoMessageRepository implements MessageRepository {
  constructor(private readonly messageModel: Model<MessageDocument>) {}

  async findById(id: string): Promise<Message | null> {
    const doc = await this.messageModel.findById(id).lean().exec();
    return doc === null ? null : toMessage(doc);
  }

  async findByInstanceAndRemoteJid(instanceId: string, remoteJid: string): Promise<Message[]> {
    const docs = await this.messageModel
      .find({ instanceId, remoteJid })
      .sort({ timestamp: 1 })
      .lean()
      .exec();
    return docs.map(toMessage);
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const doc = await this.messageModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      instanceId: input.instanceId,
      messageId: input.messageId,
      remoteJid: input.remoteJid,
      participant: input.participant,
      fromMe: input.fromMe,
      direction: input.direction,
      timestamp: input.timestamp,
      messageType: input.messageType,
      text: input.text,
      rawMessage: input.rawMessage,
      status: input.status,
    });
    return toMessage(doc);
  }

  async updateStatus(id: string, status: UpdateMessageStatusInput): Promise<Message | null> {
    const doc = await this.messageModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .lean()
      .exec();
    return doc === null ? null : toMessage(doc);
  }

  async findByTenantId(tenantId: string): Promise<Message[]> {
    const docs = await this.messageModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    return docs.map(toMessage);
  }

  async findDuplicate(
    tenantId: string,
    instanceId: string,
    messageId: string,
  ): Promise<Message | null> {
    const doc = await this.messageModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), instanceId, messageId })
      .lean()
      .exec();
    return doc === null ? null : toMessage(doc);
  }
}
