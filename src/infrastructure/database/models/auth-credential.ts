import { Schema, model, SchemaTypes } from 'mongoose';

export interface AuthCredentialDocument {
  tenantId: Schema.Types.ObjectId;
  instanceId: string;
  creds: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const authCredentialSchema = new Schema<AuthCredentialDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true },
    creds: { type: SchemaTypes.Mixed, required: true },
  },
  {
    collection: 'authcredentials',
    timestamps: true,
  },
);

authCredentialSchema.set('strict', true);

authCredentialSchema.index({ tenantId: 1, instanceId: 1 }, { unique: true });

export const AuthCredentialModel = model<AuthCredentialDocument>(
  'AuthCredential',
  authCredentialSchema,
);
