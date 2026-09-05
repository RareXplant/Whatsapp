import { Types, type Model } from 'mongoose';
import type { AuditLog } from '../../../domain/entities/audit-log.js';
import type {
  AuditLogRepository,
  CreateAuditLogInput,
} from '../../../domain/ports/audit-log-repository.js';
import type { AuditLogDocument } from '../models/audit-log.js';

interface AuditLogDocWithId extends AuditLogDocument {
  _id: unknown;
}

function toAuditLog(doc: AuditLogDocWithId): AuditLog {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    userId: doc.userId === null ? null : doc.userId.toString(),
    apiKeyId: doc.apiKeyId === null ? null : doc.apiKeyId.toString(),
    action: doc.action,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId,
    timestamp: doc.timestamp,
    requestId: doc.requestId,
    ipAddress: doc.ipAddress,
    userAgent: doc.userAgent,
    result: doc.result,
    details: doc.details,
    createdAt: doc.createdAt,
  };
}

export class MongoAuditLogRepository implements AuditLogRepository {
  constructor(private readonly auditLogModel: Model<AuditLogDocument>) {}

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const doc = await this.auditLogModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      userId: input.userId === null ? null : new Types.ObjectId(input.userId),
      apiKeyId: input.apiKeyId === null ? null : new Types.ObjectId(input.apiKeyId),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      result: input.result,
      details: input.details,
    });
    return toAuditLog(doc);
  }

  async findByTenantId(tenantId: string): Promise<AuditLog[]> {
    const docs = await this.auditLogModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    return docs.map(toAuditLog);
  }

  async findByInstanceId(instanceId: string): Promise<AuditLog[]> {
    const docs = await this.auditLogModel
      .find({ resourceType: 'instance', resourceId: instanceId })
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    return docs.map(toAuditLog);
  }
}
