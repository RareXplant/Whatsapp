import { Types, type Model } from 'mongoose';
import type { ApiKey } from '../../../domain/entities/api-key.js';
import type {
  ApiKeyRepository,
  CreateApiKeyInput,
} from '../../../domain/ports/api-key-repository.js';
import type { ApiKeyDocument } from '../models/api-key.js';

interface ApiKeyDocWithId extends ApiKeyDocument {
  _id: unknown;
}

function toApiKey(doc: ApiKeyDocWithId): ApiKey {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    keyHash: doc.keyHash,
    keyPrefix: doc.keyPrefix,
    scopes: doc.scopes,
    expiresAt: doc.expiresAt,
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt,
  };
}

export class MongoApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly apiKeyModel: Model<ApiKeyDocument>) {}

  async findById(id: string): Promise<ApiKey | null> {
    const doc = await this.apiKeyModel.findById(id).lean().exec();
    return doc === null ? null : toApiKey(doc);
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const doc = await this.apiKeyModel.findOne({ keyHash }).lean().exec();
    return doc === null ? null : toApiKey(doc);
  }

  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    const docs = await this.apiKeyModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean()
      .exec();
    return docs.map(toApiKey);
  }

  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    const doc = await this.apiKeyModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      userId: new Types.ObjectId(input.userId),
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    });
    return toApiKey(doc);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.apiKeyModel.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }

  async updateLastUsed(id: string, lastUsedAt: Date): Promise<ApiKey | null> {
    const doc = await this.apiKeyModel
      .findByIdAndUpdate(id, { lastUsedAt }, { new: true })
      .lean()
      .exec();
    return doc === null ? null : toApiKey(doc);
  }
}
