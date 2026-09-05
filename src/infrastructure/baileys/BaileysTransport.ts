import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  proto,
  type AnyMessageContent,
  type AuthenticationCreds,
  type ConnectionState,
  type MessageUpsertType,
  type WAMessage,
  type WAMessageKey,
  type WAMessageUpdate,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'node:events';
import { config } from '../../config.js';
import type { Logger } from '../../logger.js';
import type { MessageStatus, MessageType } from '../../domain/entities/index.js';
import type {
  AuthRepository,
  WhatsAppTransport,
  WhatsAppTransportEventMap,
} from '../../domain/ports/index.js';
import { useMongoAuthState } from './auth/useMongoAuthState.js';

export type GetMessage = (key: WAMessageKey) => Promise<proto.IMessage | undefined>;

export interface BaileysTransportOptions {
  tenantId: string;
  instanceId: string;
  authRepository: AuthRepository;
  logger: Logger;
}

type ConnectionStateName = 'idle' | 'connecting' | 'open' | 'close';

/** Unwraps ephemeral / view-once envelopes down to the real content. */
function unwrapMessageContent(message: proto.IMessage): proto.IMessage {
  let current = message;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else {
      break;
    }
  }
  return current;
}

function detectMessageType(message: proto.IMessage): MessageType {
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage || message.documentWithCaptionMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.locationMessage || message.liveLocationMessage) return 'location';
  if (message.contactMessage || message.contactsArrayMessage) return 'contact';
  if (message.reactionMessage) return 'reaction';
  if (message.ephemeralMessage || message.viewOnceMessage || message.viewOnceMessageV2) {
    return 'ephemeral';
  }
  return 'unknown';
}

function extractMessageText(message: proto.IMessage): string | null {
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    null
  );
}

function mapMessageStatus(status: number | null | undefined): MessageStatus | null {
  switch (status) {
    case proto.WebMessageInfo.Status.PENDING:
      return 'pending';
    case proto.WebMessageInfo.Status.SERVER_ACK:
      return 'sent';
    case proto.WebMessageInfo.Status.DELIVERY_ACK:
      return 'delivered';
    case proto.WebMessageInfo.Status.READ:
      return 'read';
    case proto.WebMessageInfo.Status.PLAYED:
      return 'played';
    case proto.WebMessageInfo.Status.ERROR:
      return 'failed';
    default:
      return null;
  }
}

export class BaileysTransport extends EventEmitter implements WhatsAppTransport {
  private readonly instanceId: string;
  private readonly tenantId: string;
  private readonly authRepository: AuthRepository;
  private readonly logger: Logger;

  private socket: WASocket | null = null;
  private connectionState: ConnectionStateName = 'idle';
  private connecting = false;
  private messageGetter: GetMessage | null = null;

  constructor(options: BaileysTransportOptions) {
    super();
    this.tenantId = options.tenantId;
    this.instanceId = options.instanceId;
    this.authRepository = options.authRepository;
    this.logger = options.logger;
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'open' && this.socket) return;
    if (this.connecting) return;

    this.connecting = true;
    try {
      const { state, saveCreds } = await useMongoAuthState(
        this.tenantId,
        this.instanceId,
        this.authRepository,
      );

      const socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        logger: this.logger,
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
        getMessage: (key: WAMessageKey): Promise<proto.IMessage | undefined> =>
          this.messageGetter ? this.messageGetter(key) : Promise.resolve(undefined),
      });

      this.socket = socket;
      this.connectionState = 'connecting';
      this.bindSocketEvents(socket, state.creds, saveCreds);
      this.logger.info({ instanceId: this.instanceId }, 'wa socket created');
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.connectionState = 'close';
    if (!socket) return;

    try {
      await socket.end(new Error('manual disconnect'));
    } catch (err) {
      this.logger.warn({ err, instanceId: this.instanceId }, 'error during manual disconnect');
    }
  }

  async logout(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    this.connectionState = 'close';

    try {
      await socket.logout();
    } finally {
      await socket
        .end(undefined)
        .catch((err: unknown) =>
          this.logger.warn(
            { err, instanceId: this.instanceId },
            'error ending socket after logout',
          ),
        );
    }
  }

  async sendMessage(to: string, content: AnyMessageContent): Promise<unknown> {
    const socket = this.socket;
    if (!socket) throw new Error('socket not ready');
    if (this.connectionState !== 'open') throw new Error('socket is not connected');
    return socket.sendMessage(to, content);
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    const socket = this.socket;
    if (!socket) throw new Error('socket not ready');
    const pairingCode = await socket.requestPairingCode(phoneNumber);
    this.emitEvent('pairingCode', { instanceId: this.instanceId, pairingCode });
    return pairingCode;
  }

  getSocket(): WASocket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.connectionState === 'open' && this.socket !== null;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  /** Wire a getMessage callback (typically backed by the message store). */
  setGetMessage(getMessage: GetMessage): void {
    this.messageGetter = getMessage;
  }

  private bindSocketEvents(
    socket: WASocket,
    creds: AuthenticationCreds,
    saveCreds: () => Promise<void>,
  ): void {
    socket.ev.on('connection.update', (update) =>
      this.handleConnectionUpdate(update, socket, creds),
    );
    socket.ev.on('creds.update', () => {
      this.emitEvent('credentialsUpdated', { instanceId: this.instanceId });
      void saveCreds().catch((err: unknown) =>
        this.logger.error({ err, instanceId: this.instanceId }, 'failed to persist creds'),
      );
    });
    socket.ev.on('messages.upsert', (payload) => this.handleMessagesUpsert(payload));
    socket.ev.on('messages.update', (updates) => this.handleMessagesUpdate(updates));
  }

  private handleConnectionUpdate(
    update: Partial<ConnectionState>,
    socket: WASocket,
    creds: AuthenticationCreds,
  ): void {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      this.emitEvent('qr', {
        instanceId: this.instanceId,
        qr,
        ttl: config.QR_TTL_SECONDS,
      });
      this.logger.debug({ instanceId: this.instanceId }, 'qr received');
    }

    if (connection === 'connecting') {
      this.connectionState = 'connecting';
    }

    if (connection === 'open') {
      this.connectionState = 'open';
      const user = socket.user;
      this.emitEvent('connected', {
        instanceId: this.instanceId,
        phoneNumber: user?.id ? user.id.replace(/[^0-9]/g, '') : null,
        pushName: user?.name ?? null,
        platform: creds.platform ?? user?.verifiedName ?? null,
      });
      this.logger.info({ instanceId: this.instanceId }, 'connection open');
    }

    if (connection === 'close') {
      this.connectionState = 'close';
      const reason = this.extractDisconnectReason(lastDisconnect);
      const isLoggedOut = Number(reason) === DisconnectReason.loggedOut;

      this.emitEvent('disconnected', {
        instanceId: this.instanceId,
        reason,
        isReconnecting: false,
      });

      if (isLoggedOut) {
        this.emitEvent('loggedOut', { instanceId: this.instanceId });
      }
      this.socket = null;
      this.logger.warn({ instanceId: this.instanceId, reason }, 'connection closed');
    }
  }

  private handleMessagesUpsert(payload: { messages: WAMessage[]; type: MessageUpsertType }): void {
    for (const message of payload.messages) {
      if (!message.key?.id || !message.key.remoteJid) continue;
      if (!message.message) continue;

      const content = unwrapMessageContent(message.message);
      const messageTimestamp = Number(message.messageTimestamp ?? 0);

      this.emitEvent('messageReceived', {
        instanceId: this.instanceId,
        messageId: message.key.id,
        remoteJid: message.key.remoteJid,
        participant: message.key.participant ?? null,
        fromMe: message.key.fromMe ?? false,
        timestamp: new Date(messageTimestamp > 0 ? messageTimestamp * 1000 : Date.now()),
        messageType: detectMessageType(content),
        text: extractMessageText(content),
        rawMessage: message.message,
      });
    }
  }

  private handleMessagesUpdate(updates: WAMessageUpdate[]): void {
    for (const { key, update } of updates) {
      const status = mapMessageStatus(update.status);
      if (!status || !key.id || !key.remoteJid) continue;

      this.emitEvent('messageUpdated', {
        instanceId: this.instanceId,
        messageId: key.id,
        remoteJid: key.remoteJid,
        fromMe: key.fromMe ?? false,
        status,
        timestamp: new Date(),
      });
    }
  }

  private extractDisconnectReason(lastDisconnect: ConnectionState['lastDisconnect']): string {
    const error = lastDisconnect?.error;
    if (!error) return 'unknown';

    const boom = error as Boom;
    const statusCode =
      typeof boom.output?.statusCode === 'number' ? boom.output.statusCode : undefined;
    if (statusCode !== undefined) return String(statusCode);

    return error.message || 'unknown';
  }

  private emitEvent<K extends keyof WhatsAppTransportEventMap>(
    event: K,
    ...args: WhatsAppTransportEventMap[K]
  ): void {
    const rawEmit = this.emit as unknown as (eventName: string, ...args: unknown[]) => void;
    rawEmit(event as string, ...(args as unknown[]));
  }
}
