import { Schema, model, SchemaTypes } from 'mongoose';
import type {
  MessageDirection,
  MessageStatus,
  MessageType,
} from '../../../domain/entities/message.js';

export const MESSAGE_DIRECTIONS: MessageDirection[] = ['inbound', 'outbound'];
export const MESSAGE_STATUSES: MessageStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'played',
  'failed',
  'expired',
];
export const MESSAGE_TYPES: MessageType[] = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'reaction',
  'ephemeral',
  'unknown',
];

export interface MessageDocument {
  tenantId: Schema.Types.ObjectId;
  instanceId: string;
  messageId: string;
  remoteJid: string;
  participant: string | null;
  fromMe: boolean;
  direction: MessageDirection;
  timestamp: Date;
  messageType: MessageType;
  text: string | null;
  rawMessage: unknown;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true },
    instanceId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    remoteJid: { type: String, required: true },
    participant: { type: String, default: null },
    fromMe: { type: Boolean, required: true },
    direction: { type: String, enum: MESSAGE_DIRECTIONS, required: true },
    timestamp: { type: Date, required: true },
    messageType: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    text: { type: String, default: null },
    rawMessage: { type: SchemaTypes.Mixed, default: null },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'pending' },
  },
  {
    collection: 'messages',
    timestamps: true,
  },
);

messageSchema.set('strict', true);

messageSchema.index({ tenantId: 1, instanceId: 1, remoteJid: 1, messageId: 1 }, { unique: true });
messageSchema.index({ tenantId: 1, instanceId: 1, remoteJid: 1 });

export const MessageModel = model<MessageDocument>('Message', messageSchema);
