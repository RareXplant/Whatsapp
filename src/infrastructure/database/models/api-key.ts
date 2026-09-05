import { Schema, model, SchemaTypes } from 'mongoose';

export interface ApiKeyDocument {
  tenantId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    userId: { type: SchemaTypes.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    scopes: { type: [String], default: [] },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'apikeys',
  },
);

apiKeySchema.set('strict', true);

apiKeySchema.index({ keyHash: 1 }, { unique: true });
apiKeySchema.index({ tenantId: 1 });

export const ApiKeyModel = model<ApiKeyDocument>('ApiKey', apiKeySchema);
