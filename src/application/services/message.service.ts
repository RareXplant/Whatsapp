import { logger, type Logger } from '../../logger.js';
import type { Message } from '../../domain/entities/index.js';
import type {
  InstanceRepository,
  MessageRepository,
  WebhookDispatcherPort,
  WhatsAppMessageReceivedPayload,
  WhatsAppMessageUpdatedPayload,
} from '../../domain/ports/index.js';
import type { RuntimeInstance } from '../../infrastructure/baileys/WhatsAppManager.js';
import type { GetMessage } from '../../infrastructure/baileys/BaileysTransport.js';
import {
  InstanceNotConnectedError,
  InstanceNotFoundError,
  MessageSendError,
  ValidationError,
} from '../../shared/errors/index.js';

const JID_PATTERN = /^(?:[0-9]+@s\.whatsapp\.net|[0-9]+(-[0-9]+)?@g\.us|status@broadcast)$/;

export interface SendTextParams {
  to: string;
  text: string;
}

export interface SendTextResult {
  messageId: string;
}

export interface MessageServiceOptions {
  messageRepository: MessageRepository;
  instanceRepository: InstanceRepository;
  getRuntimeInstance: (instanceId: string) => RuntimeInstance | undefined;
  webhookDispatcher: WebhookDispatcherPort;
  sendRuntimeEvent?: (event: string, payload: Record<string, unknown>) => void;
  logger?: Logger;
}

export class MessageService {
  private readonly messageRepository: MessageRepository;
  private readonly instanceRepository: InstanceRepository;
  private runtimeProvider: (instanceId: string) => RuntimeInstance | undefined;
  private readonly webhookDispatcher: WebhookDispatcherPort;
  private readonly sendRuntimeEvent: (event: string, payload: Record<string, unknown>) => void;
  private readonly logger: Logger;

  constructor(options: MessageServiceOptions) {
    this.messageRepository = options.messageRepository;
    this.instanceRepository = options.instanceRepository;
    this.runtimeProvider = options.getRuntimeInstance;
    this.webhookDispatcher = options.webhookDispatcher;
    this.sendRuntimeEvent = options.sendRuntimeEvent ?? (() => undefined);
    this.logger = options.logger ?? logger;
  }

  setRuntimeProvider(provider: (instanceId: string) => RuntimeInstance | undefined): void {
    this.runtimeProvider = provider;
  }

  async sendText(
    tenantId: string,
    instanceId: string,
    params: SendTextParams,
  ): Promise<SendTextResult> {
    if (!JID_PATTERN.test(params.to)) {
      throw new ValidationError('Invalid JID', { to: params.to });
    }

    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance || instance.tenantId !== tenantId) {
      throw new InstanceNotFoundError(instanceId);
    }

    const runtime = this.runtimeProvider(instanceId);
    if (!runtime || !runtime.transport.isConnected()) {
      throw new InstanceNotConnectedError(instanceId);
    }

    let key: unknown;
    try {
      key = await runtime.transport.sendMessage(params.to, { text: params.text });
    } catch (err) {
      this.logger.error({ err, tenantId, instanceId, to: params.to }, 'message send failed');
      throw new MessageSendError(err instanceof Error ? err.message : 'unknown error', {
        to: params.to,
      });
    }

    const messageId = (key as { id?: string } | null)?.id ?? `local_${Date.now().toString(36)}`;

    const saved = await this.messageRepository.create({
      tenantId,
      instanceId,
      messageId,
      remoteJid: params.to,
      participant: null,
      fromMe: true,
      direction: 'outbound',
      timestamp: new Date(),
      messageType: 'text',
      text: params.text,
      rawMessage: { key, text: params.text },
      status: 'pending',
    });

    this.sendRuntimeEvent('message.received', {
      instanceId,
      messageId,
      remoteJid: params.to,
      fromMe: true,
      direction: 'outbound',
    } as Record<string, unknown>);

    this.logger.info({ tenantId, instanceId, messageId, to: params.to }, 'text message sent');

    return { messageId: saved.messageId };
  }

  async handleIncomingMessage(message: WhatsAppMessageReceivedPayload): Promise<void> {
    const { instanceId, messageId, remoteJid } = message;

    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance) {
      this.logger.warn({ instanceId }, 'message received for unknown instance, ignoring');
      return;
    }
    const tenantId = instance.tenantId;

    const duplicate = await this.messageRepository
      .findDuplicate(tenantId, instanceId, messageId)
      .catch(() => null);
    if (duplicate) {
      this.logger.debug({ tenantId, instanceId, messageId }, 'duplicate message ignored');
      return;
    }

    const saved = await this.messageRepository.create({
      tenantId,
      instanceId,
      messageId,
      remoteJid,
      participant: message.participant ?? null,
      fromMe: message.fromMe,
      direction: message.fromMe ? 'outbound' : 'inbound',
      timestamp: message.timestamp,
      messageType: message.messageType,
      text: message.text,
      rawMessage: message.rawMessage,
      status: 'pending',
    });

    this.sendRuntimeEvent('message.received', {
      instanceId,
      messageId,
      remoteJid,
      fromMe: message.fromMe,
      timestamp: message.timestamp,
    } as Record<string, unknown>);

    if (instance.webhookUrl && instance.webhookSecret) {
      await this.webhookDispatcher.dispatch(
        instance.tenantId,
        instance.instanceId,
        instance.webhookUrl,
        instance.webhookSecret,
        'message.received',
        {
          instanceId,
          messageId: saved.messageId,
          remoteJid,
          fromMe: saved.fromMe,
          timestamp: saved.timestamp.toISOString(),
          type: saved.messageType,
          text: saved.text,
        },
      );
    }

    this.logger.debug({ tenantId, instanceId, messageId }, 'incoming message persisted');
  }

  async handleMessageUpdate(update: WhatsAppMessageUpdatedPayload): Promise<void> {
    const { instanceId, messageId } = update;

    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance) {
      this.logger.debug({ instanceId }, 'message update for unknown instance, ignoring');
      return;
    }

    const found = await this.messageRepository.findDuplicate(
      instance.tenantId,
      instanceId,
      messageId,
    );
    if (!found) {
      this.logger.debug(
        { tenantId: instance.tenantId, instanceId, messageId },
        'message update for unknown message, ignoring',
      );
      return;
    }

    await this.messageRepository.updateStatus(found._id, update.status);

    this.sendRuntimeEvent('message.updated', {
      instanceId,
      messageId,
      status: update.status,
    } as Record<string, unknown>);

    this.logger.debug(
      { tenantId: instance.tenantId, instanceId, messageId, status: update.status },
      'message status updated',
    );
  }

  createGetMessage(tenantId: string, instanceId: string): GetMessage {
    return async (key) => {
      const messageId = key.id;
      if (!messageId || !key.remoteJid) return undefined;

      let messages: Message[];
      try {
        messages = await this.messageRepository.findByInstanceAndRemoteJid(
          instanceId,
          key.remoteJid,
        );
      } catch {
        return undefined;
      }

      const message = messages.find((m) => m.messageId === messageId);
      if (!message) return undefined;

      const raw = message.rawMessage as Record<string, unknown> | null;
      if (!raw || !('text' in raw)) return undefined;

      const text = message.text ?? '';
      const rawText = raw.text as { text?: string } | undefined;
      return {
        conversation: text || rawText?.text,
      };
    };
  }
}
