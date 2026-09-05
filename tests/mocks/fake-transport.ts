import { EventEmitter } from 'node:events';
import type { AnyMessageContent } from '@whiskeysockets/baileys';
import type {
  WhatsAppConnectedPayload,
  WhatsAppDisconnectedPayload,
  WhatsAppMessageReceivedPayload,
  WhatsAppMessageUpdatedPayload,
  WhatsAppPairingCodePayload,
  WhatsAppQrPayload,
  WhatsAppTransport,
} from '../../src/domain/ports/index.js';

export interface FakeTransportOptions {
  tenantId?: string;
  instanceId?: string;
  failConnect?: boolean;
  connectDelayMs?: number;
}

/**
 * In-memory stand-in for BaileysTransport. Emits events on demand so unit tests
 * can drive the WhatsAppManager lifecycle deterministically without any network.
 */
export class FakeTransport extends EventEmitter implements WhatsAppTransport {
  public readonly tenantId: string;
  public readonly instanceId: string;

  private socket: unknown = null;
  private readonly failConnect: boolean;
  private readonly connectDelayMs: number;

  connectAttempts = 0;
  disconnectCalls = 0;
  logoutCalls = 0;
  sentMessages: Array<{ to: string; content: AnyMessageContent }> = [];
  pairingRequests: string[] = [];

  constructor(options: FakeTransportOptions = {}) {
    super();
    this.tenantId = options.tenantId ?? 'tenant-test';
    this.instanceId = options.instanceId ?? 'inst_test';
    this.failConnect = options.failConnect ?? false;
    this.connectDelayMs = options.connectDelayMs ?? 0;
  }

  async connect(): Promise<void> {
    this.connectAttempts += 1;
    if (this.failConnect) {
      throw new Error('fake connect failure');
    }
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    this.socket = { fakeSocket: true };
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.socket = null;
  }

  async logout(): Promise<void> {
    this.logoutCalls += 1;
    this.socket = null;
  }

  async sendMessage(to: string, content: AnyMessageContent): Promise<unknown> {
    this.sentMessages.push({ to, content });
    return { messageId: `msg_${this.sentMessages.length}` };
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    this.pairingRequests.push(phoneNumber);
    return 'FAAKE-PAIRING-CODE';
  }

  getSocket(): unknown | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket !== null;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  emitQr(qr: string, ttl = 30): void {
    const payload: WhatsAppQrPayload = { instanceId: this.instanceId, qr, ttl };
    this.emit('qr', payload);
  }

  emitConnected(phoneNumber: string | null = null): void {
    const payload: WhatsAppConnectedPayload = {
      instanceId: this.instanceId,
      phoneNumber,
      pushName: 'Fake User',
      platform: 'fake',
    };
    this.emit('connected', payload);
  }

  emitDisconnected(reason: string, isReconnecting = false): void {
    const payload: WhatsAppDisconnectedPayload = {
      instanceId: this.instanceId,
      reason,
      isReconnecting,
    };
    this.emit('disconnected', payload);
  }

  emitLoggedOut(): void {
    this.emit('loggedOut', { instanceId: this.instanceId });
  }

  emitMessage(
    overrides: Partial<WhatsAppMessageReceivedPayload> = {},
  ): WhatsAppMessageReceivedPayload {
    const payload: WhatsAppMessageReceivedPayload = {
      instanceId: this.instanceId,
      messageId: `remote_msg_${Math.random().toString(36).slice(2)}`,
      remoteJid: '5511999990000@s.whatsapp.net',
      participant: null,
      fromMe: false,
      timestamp: new Date(),
      messageType: 'text',
      text: 'hello',
      rawMessage: {},
      ...overrides,
    };
    this.emit('messageReceived', payload);
    return payload;
  }

  emitMessageUpdated(overrides: Partial<WhatsAppMessageUpdatedPayload> = {}): void {
    this.emit('messageUpdated', {
      instanceId: this.instanceId,
      messageId: 'remote_msg_1',
      remoteJid: '5511999990000@s.whatsapp.net',
      fromMe: false,
      status: 'delivered',
      timestamp: new Date(),
      ...overrides,
    });
  }

  emitCredentialsUpdated(): void {
    this.emit('credentialsUpdated', { instanceId: this.instanceId });
  }
}
