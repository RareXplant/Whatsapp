import { EventEmitter } from 'node:events';
import type { AnyMessageContent } from '@whiskeysockets/baileys';
import type { MessageStatus, MessageType } from '../entities/index.js';

export interface WhatsAppMessageReceivedPayload {
  instanceId: string;
  messageId: string;
  remoteJid: string;
  participant: string | null;
  fromMe: boolean;
  timestamp: Date;
  messageType: MessageType;
  text: string | null;
  rawMessage: unknown;
}

export interface WhatsAppMessageUpdatedPayload {
  instanceId: string;
  messageId: string;
  remoteJid: string;
  fromMe: boolean;
  status: MessageStatus;
  timestamp: Date;
}

export interface WhatsAppConnectedPayload {
  instanceId: string;
  phoneNumber: string | null;
  pushName: string | null;
  platform: string | null;
}

export interface WhatsAppDisconnectedPayload {
  instanceId: string;
  reason: string;
  isReconnecting: boolean;
}

export interface WhatsAppLoggedOutPayload {
  instanceId: string;
}

export interface WhatsAppQrPayload {
  instanceId: string;
  qr: string;
  ttl: number;
}

export interface WhatsAppPairingCodePayload {
  instanceId: string;
  pairingCode: string;
}

export interface WhatsAppCredentialsUpdatedPayload {
  instanceId: string;
}

export type WhatsAppTransportEventMap = {
  qr: [payload: WhatsAppQrPayload];
  pairingCode: [payload: WhatsAppPairingCodePayload];
  connected: [payload: WhatsAppConnectedPayload];
  disconnected: [payload: WhatsAppDisconnectedPayload];
  loggedOut: [payload: WhatsAppLoggedOutPayload];
  messageReceived: [payload: WhatsAppMessageReceivedPayload];
  messageUpdated: [payload: WhatsAppMessageUpdatedPayload];
  credentialsUpdated: [payload: WhatsAppCredentialsUpdatedPayload];
};

export interface WhatsAppTransport extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;
  sendMessage(to: string, content: AnyMessageContent): Promise<unknown>;
  requestPairingCode(phoneNumber: string): Promise<string>;
  getSocket(): unknown | null;
  isConnected(): boolean;
  getInstanceId(): string;
}
