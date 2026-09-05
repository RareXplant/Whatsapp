import { Schema, model, SchemaTypes } from 'mongoose';
import type { InstanceStatus } from '../../../domain/entities/instance.js';

export const INSTANCE_STATUSES: InstanceStatus[] = [
  'created',
  'connecting',
  'qr_ready',
  'pairing_code_ready',
  'connected',
  'disconnected',
  'reconnecting',
  'logged_out',
  'error',
  'deleting',
];

export interface InstanceDocument {
  tenantId: Schema.Types.ObjectId;
  instanceId: string;
  name: string;
  status: InstanceStatus;
  phoneNumber: string | null;
  pushName: string | null;
  profilePictureUrl: string | null;
  platform: string | null;
  connectionState: string | null;
  lastQr: string | null;
  pairingCode: string | null;
  pairingPhoneNumber: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastErrorAt: Date | null;
  reconnectAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const instanceSchema = new Schema<InstanceDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: INSTANCE_STATUSES, required: true, default: 'created' },
    phoneNumber: { type: String, default: null },
    pushName: { type: String, default: null },
    profilePictureUrl: { type: String, default: null },
    platform: { type: String, default: null },
    connectionState: { type: String, default: null },
    lastQr: { type: String, default: null },
    pairingCode: { type: String, default: null },
    pairingPhoneNumber: { type: String, default: null },
    webhookUrl: { type: String, default: null },
    webhookSecret: { type: String, default: null },
    lastConnectedAt: { type: Date, default: null },
    lastDisconnectedAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    reconnectAttempts: { type: Number, default: 0 },
  },
  {
    collection: 'instances',
    timestamps: true,
  },
);

instanceSchema.set('strict', true);

instanceSchema.index({ tenantId: 1, instanceId: 1 }, { unique: true });
instanceSchema.index({ tenantId: 1 });

export const InstanceModel = model<InstanceDocument>('Instance', instanceSchema);
