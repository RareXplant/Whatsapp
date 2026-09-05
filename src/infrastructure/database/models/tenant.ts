import { Schema, model } from 'mongoose';

export interface TenantDocument {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
  },
  {
    collection: 'tenants',
    timestamps: true,
  },
);

tenantSchema.set('strict', true);

tenantSchema.index({ slug: 1 }, { unique: true });

export const TenantModel = model<TenantDocument>('Tenant', tenantSchema);
