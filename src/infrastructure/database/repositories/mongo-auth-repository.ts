import { Types, type Model } from 'mongoose';
import type { AuthCredential } from '../../../domain/entities/auth-credential.js';
import type { AuthKey, AuthKeyCategory } from '../../../domain/entities/auth-key.js';
import type { AuthRepository } from '../../../domain/ports/auth-repository.js';
import type { AuthCredentialDocument } from '../models/auth-credential.js';
import type { AuthKeyDocument } from '../models/auth-key.js';

interface AuthCredentialDocWithId extends AuthCredentialDocument {
  _id: unknown;
}

interface AuthKeyDocWithId extends AuthKeyDocument {
  _id: unknown;
}

function toAuthCredential(doc: AuthCredentialDocWithId): AuthCredential {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    creds: doc.creds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toAuthKey(doc: AuthKeyDocWithId): AuthKey {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    instanceId: doc.instanceId,
    category: doc.category,
    keyId: doc.keyId,
    data: doc.data,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoAuthRepository implements AuthRepository {
  constructor(
    private readonly authCredentialModel: Model<AuthCredentialDocument>,
    private readonly authKeyModel: Model<AuthKeyDocument>,
  ) {}

  async findCreds(tenantId: string, instanceId: string): Promise<AuthCredential | null> {
    const doc = await this.authCredentialModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), instanceId })
      .lean()
      .exec();
    return doc === null ? null : toAuthCredential(doc);
  }

  async saveCreds(
    tenantId: string,
    instanceId: string,
    creds: Record<string, unknown>,
  ): Promise<AuthCredential> {
    const doc = await this.authCredentialModel
      .findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId), instanceId },
        { $set: { creds } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    if (doc === null) {
      throw new Error('failed to save WhatsApp auth credentials');
    }
    return toAuthCredential(doc);
  }

  async deleteCreds(tenantId: string, instanceId: string): Promise<boolean> {
    const result = await this.authCredentialModel
      .deleteOne({ tenantId: new Types.ObjectId(tenantId), instanceId })
      .exec();
    return result.deletedCount === 1;
  }

  async findKeys(
    tenantId: string,
    instanceId: string,
    category: AuthKeyCategory,
  ): Promise<AuthKey[]> {
    const docs = await this.authKeyModel
      .find({ tenantId: new Types.ObjectId(tenantId), instanceId, category })
      .lean()
      .exec();
    return docs.map(toAuthKey);
  }

  async setKeys(
    tenantId: string,
    instanceId: string,
    category: AuthKeyCategory,
    entries: Record<string, Record<string, unknown>>,
  ): Promise<AuthKey[]> {
    const operations = Object.entries(entries).map(([keyId, data]) => ({
      updateOne: {
        filter: { tenantId: new Types.ObjectId(tenantId), instanceId, category, keyId },
        update: { $set: { data } },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.authKeyModel.bulkWrite(operations, { timestamps: true });
    }
    return this.findKeys(tenantId, instanceId, category);
  }

  async deleteKey(tenantId: string, instanceId: string, keyId: string): Promise<boolean> {
    const result = await this.authKeyModel
      .deleteOne({ tenantId: new Types.ObjectId(tenantId), instanceId, keyId })
      .exec();
    return result.deletedCount === 1;
  }
}
