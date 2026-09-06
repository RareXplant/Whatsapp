import { Schema, model, SchemaTypes } from 'mongoose';

export interface InstanceLeaseDocument {
  tenantId: Schema.Types.ObjectId;
  instanceId: string;
  ownerId: string;
  leaseUntil: Date;
  heartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const instanceLeaseSchema = new Schema<InstanceLeaseDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true },
    ownerId: { type: String, required: true },
    leaseUntil: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
  },
  {
    collection: 'instanceleases',
    timestamps: true,
  },
);

instanceLeaseSchema.set('strict', true);

instanceLeaseSchema.index({ tenantId: 1, instanceId: 1 }, { unique: true });
instanceLeaseSchema.index({ leaseUntil: 1 });

export const InstanceLeaseModel = model<InstanceLeaseDocument>(
  'InstanceLease',
  instanceLeaseSchema,
);
