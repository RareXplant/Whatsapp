import type { Message, MessageDirection, MessageStatus, MessageType } from '../entities/index.js';

export interface CreateMessageInput {
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
}

export type UpdateMessageStatusInput = MessageStatus;

export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  findByInstanceAndRemoteJid(instanceId: string, remoteJid: string): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  updateStatus(id: string, status: UpdateMessageStatusInput): Promise<Message | null>;
  findByTenantId(tenantId: string): Promise<Message[]>;
  findDuplicate(tenantId: string, instanceId: string, messageId: string): Promise<Message | null>;
}
