import { Schema, model, SchemaTypes } from 'mongoose';

export const AUDIT_RESULTS = ['success', 'failure'] as const;

export type AuditResult = (typeof AUDIT_RESULTS)[number];

export interface AuditLogDocument {
  tenantId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId | null;
  apiKeyId: Schema.Types.ObjectId | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  timestamp: Date;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  result: AuditResult;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    userId: { type: SchemaTypes.ObjectId, ref: 'User', default: null },
    apiKeyId: { type: SchemaTypes.ObjectId, ref: 'ApiKey', default: null },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
    requestId: { type: String, required: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    result: { type: String, enum: AUDIT_RESULTS, default: 'success' },
    details: { type: SchemaTypes.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'auditlogs',
  },
);

auditLogSchema.set('strict', true);

auditLogSchema.index({ tenantId: 1 });
auditLogSchema.index({ timestamp: 1 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', auditLogSchema);
