export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed' | 'expired';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'ephemeral'
  | 'unknown';

export interface Message {
  _id: string;
  tenantId: string;
  instanceId: string;
  messageId: string;
  remoteJid: string;
  participant: string | null;
  fromMe: boolean;
  direction: MessageDirection;
  timestamp: Date;
  messageType: MessageType;
  text: string | null;
  rawMessage: unknown | null;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}
