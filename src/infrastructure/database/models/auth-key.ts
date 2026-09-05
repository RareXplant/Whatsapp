import { Schema, model, SchemaTypes } from 'mongoose';
import type { AuthKeyCategory } from '../../../domain/entities/auth-key.js';

export const AUTH_KEY_CATEGORIES: AuthKeyCategory[] = [
  'pre-key',
  'session',
  'sender-key',
  'app-state-sync-key',
];

export interface AuthKeyDocument {
  tenantId: Schema.Types.ObjectId;
  instanceId: string;
  category: AuthKeyCategory;
  keyId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const authKeySchema = new Schema<AuthKeyDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true },
    category: { type: String, enum: AUTH_KEY_CATEGORIES, required: true },
    keyId: { type: String, required: true },
    data: { type: SchemaTypes.Mixed, required: true },
  },
  {
    collection: 'authkeys',
    timestamps: true,
  },
);

authKeySchema.set('strict', true);

authKeySchema.index({ tenantId: 1, instanceId: 1, category: 1, keyId: 1 }, { unique: true });

export const AuthKeyModel = model<AuthKeyDocument>('AuthKey', authKeySchema);
