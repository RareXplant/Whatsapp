import { describe, expect, it } from 'vitest';
import { MessageService } from '../../../../src/application/services/message.service.js';
import { WhatsAppManager } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { TransportFactory } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { BaileysTransport } from '../../../../src/infrastructure/baileys/BaileysTransport.js';
import type { WebhookDispatcherPort } from '../../../../src/domain/ports/index.js';
import {
  InstanceNotConnectedError,
  InstanceNotFoundError,
  ValidationError,
} from '../../../../src/shared/errors/index.js';
import { FakeTransport } from '../../../mocks/fake-transport.js';
import {
  InMemoryAuthRepository,
  InMemoryInstanceRepository,
  InMemoryMessageRepository,
  InMemoryWebhookDeliveryRepository,
} from '../../../mocks/repositories.js';
import { makeInstance } from '../../../helpers/factories.js';

class FakeDispatcher implements WebhookDispatcherPort {
  constructor(private readonly repo: InMemoryWebhookDeliveryRepository) {}

  async dispatch(
    tenantId: string,
    instanceId: string,
    url: string,
    _secret: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.repo.create({
      tenantId,
      instanceId,
      deliveryId: `del_${Math.random().toString(36).slice(2)}`,
      event,
      url,
      payload,
      status: 'pending',
      attempts: 0,
    });
  }

  async retryPending(): Promise<void> {}
}

function setup() {
  const authRepository = new InMemoryAuthRepository();
  const instanceRepository = new InMemoryInstanceRepository();
  const messageRepository = new InMemoryMessageRepository();
  const webhookDeliveryRepository = new InMemoryWebhookDeliveryRepository();
  const transports: FakeTransport[] = [];

  const transportFactory: TransportFactory = () => {
    const t = new FakeTransport({ tenantId: 'tenant-1', instanceId: 'inst_1' });
    transports.push(t);
    return t as unknown as BaileysTransport;
  };

  const manager = new WhatsAppManager({
    authRepository,
    transportFactory,
  });

  const dispatcher = new FakeDispatcher(webhookDeliveryRepository);

  const service = new MessageService({
    messageRepository,
    instanceRepository,
    getRuntimeInstance: (id: string) => manager.getInstance(id),
    webhookDispatcher: dispatcher,
  });

  return {
    service,
    manager,
    instanceRepository,
    messageRepository,
    webhookDeliveryRepository,
    transports,
  };
}

async function createConnectedInstance(
  instanceRepository: InMemoryInstanceRepository,
  manager: WhatsAppManager,
  instanceId = 'inst_1',
) {
  const inst = makeInstance({ tenantId: 'tenant-1', instanceId, _id: `i-${instanceId}` });
  instanceRepository.items.set(inst._id, inst);
  await manager.createInstance('tenant-1', instanceId);
  return inst;
}

describe('MessageService', () => {
  describe('sendText', () => {
    it('throws ValidationError for an invalid JID', async () => {
      const { service } = setup();
      await expect(
        service.sendText('tenant-1', 'inst_1', { to: 'not-a-jid', text: 'hi' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws InstanceNotFoundError for an unknown instance', async () => {
      const { service } = setup();
      await expect(
        service.sendText('tenant-1', 'missing', { to: '5511999990000@s.whatsapp.net', text: 'hi' }),
      ).rejects.toBeInstanceOf(InstanceNotFoundError);
    });

    it('throws InstanceNotConnectedError when runtime is not connected', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_1', _id: 'i-inst_1' });
      instanceRepository.items.set(inst._id, inst);
      // no runtime created -> not connected

      await expect(
        service.sendText('tenant-1', 'inst_1', {
          to: '5511999990000@s.whatsapp.net',
          text: 'hi',
        }),
      ).rejects.toBeInstanceOf(InstanceNotConnectedError);
    });

    it('sends a text, returns a messageId, and persists the outbound message', async () => {
      const { service, instanceRepository, manager, messageRepository, transports } = setup();
      await createConnectedInstance(instanceRepository, manager);

      const result = await service.sendText('tenant-1', 'inst_1', {
        to: '5511999990000@s.whatsapp.net',
        text: 'Hello there',
      });

      expect(result.messageId).toBeTruthy();
      expect(transports[0].sentMessages).toHaveLength(1);
      expect(transports[0].sentMessages[0].to).toBe('5511999990000@s.whatsapp.net');

      const stored = [...messageRepository.items.values()][0];
      expect(stored.direction).toBe('outbound');
      expect(stored.fromMe).toBe(true);
      expect(stored.status).toBe('pending');
      expect(stored.tenantId).toBe('tenant-1');
    });
  });

  describe('setRuntimeProvider', () => {
    it('uses a runtime set via setRuntimeProvider', async () => {
      const { service, instanceRepository, manager } = setup();
      await createConnectedInstance(instanceRepository, manager);

      const swapProvider = (id: string) => manager.getInstance(id);
      service.setRuntimeProvider(swapProvider);

      const result = await service.sendText('tenant-1', 'inst_1', {
        to: '5511999990000@s.whatsapp.net',
        text: 'via provider',
      });
      expect(result.messageId).toBeTruthy();
    });
  });

  describe('handleIncomingMessage', () => {
    it('persists an inbound message and returns void', async () => {
      const { service, instanceRepository, manager, messageRepository } = setup();
      await createConnectedInstance(instanceRepository, manager);

      const payload = {
        instanceId: 'inst_1',
        messageId: 'remote_abc',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: false,
        timestamp: new Date(),
        messageType: 'text' as const,
        text: 'incoming hello',
        rawMessage: {},
      };

      const result = await service.handleIncomingMessage(payload);
      expect(result).toBeUndefined();

      const stored = [...messageRepository.items.values()][0];
      expect(stored.direction).toBe('inbound');
      expect(stored.status).toBe('pending');
      expect(stored.messageId).toBe('remote_abc');
    });

    it('ignores a duplicate messageId', async () => {
      const { service, instanceRepository, manager, messageRepository } = setup();
      await createConnectedInstance(instanceRepository, manager);

      const payload = {
        instanceId: 'inst_1',
        messageId: 'remote_dup',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: false,
        timestamp: new Date(),
        messageType: 'text' as const,
        text: 'dup',
        rawMessage: {},
      };

      await service.handleIncomingMessage(payload);
      await service.handleIncomingMessage(payload);

      const matching = [...messageRepository.items.values()].filter(
        (m) => m.messageId === 'remote_dup',
      );
      expect(matching).toHaveLength(1);
    });

    it('ignores messages for an unknown instance without throwing', async () => {
      const { service, messageRepository } = setup();
      await expect(
        service.handleIncomingMessage({
          instanceId: 'unknown-inst',
          messageId: 'remote_x',
          remoteJid: '5511999990000@s.whatsapp.net',
          participant: null,
          fromMe: false,
          timestamp: new Date(),
          messageType: 'text',
          text: 'hi',
          rawMessage: {},
        }),
      ).resolves.toBeUndefined();
      expect(messageRepository.items.size).toBe(0);
    });

    it('dispatches a webhook when the instance has a webhook config', async () => {
      const { service, instanceRepository, manager, webhookDeliveryRepository } = setup();
      await createConnectedInstance(instanceRepository, manager);
      const inst = instanceRepository.items.get('i-inst_1');
      if (inst) {
        inst.webhookUrl = 'https://example.com/hook';
        inst.webhookSecret = 'secret';
      }

      await service.handleIncomingMessage({
        instanceId: 'inst_1',
        messageId: 'remote_webhook',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: false,
        timestamp: new Date(),
        messageType: 'text',
        text: 'trigger',
        rawMessage: {},
      });

      expect(webhookDeliveryRepository.items.size).toBe(1);
      const record = [...webhookDeliveryRepository.items.values()][0];
      expect(record.status).toBe('pending');
      expect(record.url).toBe('https://example.com/hook');
    });
  });

  describe('handleMessageUpdate', () => {
    it('updates the existing message status', async () => {
      const { service, instanceRepository, messageRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_1', _id: 'i-inst_1' });
      instanceRepository.items.set(inst._id, inst);

      await messageRepository.create({
        tenantId: 'tenant-1',
        instanceId: 'inst_1',
        messageId: 'remote_upd',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: false,
        direction: 'inbound',
        timestamp: new Date(),
        messageType: 'text',
        text: 'x',
        rawMessage: {},
        status: 'pending',
      });

      await service.handleMessageUpdate({
        instanceId: 'inst_1',
        messageId: 'remote_upd',
        remoteJid: '5511999990000@s.whatsapp.net',
        fromMe: false,
        status: 'delivered',
        timestamp: new Date(),
      });

      const stored = [...messageRepository.items.values()][0];
      expect(stored.status).toBe('delivered');
    });

    it('ignores an update for an unknown messageId', async () => {
      const { service, instanceRepository, messageRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_1', _id: 'i-inst_1' });
      instanceRepository.items.set(inst._id, inst);

      await service.handleMessageUpdate({
        instanceId: 'inst_1',
        messageId: 'does-not-exist',
        remoteJid: '5511999990000@s.whatsapp.net',
        fromMe: false,
        status: 'delivered',
        timestamp: new Date(),
      });

      expect(messageRepository.items.size).toBe(0);
    });
  });

  describe('createGetMessage', () => {
    it('returns {conversation: text} for a stored outbound message', async () => {
      const { service, instanceRepository, messageRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_1', _id: 'i-inst_1' });
      instanceRepository.items.set(inst._id, inst);

      await messageRepository.create({
        tenantId: 'tenant-1',
        instanceId: 'inst_1',
        messageId: 'msg_get',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: true,
        direction: 'outbound',
        timestamp: new Date(),
        messageType: 'text',
        text: 'stored text',
        rawMessage: { key: { id: 'msg_get' }, text: 'stored text' },
        status: 'pending',
      });

      const getMessage = service.createGetMessage('tenant-1', 'inst_1');
      const result = await getMessage({
        id: 'msg_get',
        remoteJid: '5511999990000@s.whatsapp.net',
      });

      expect(result).toEqual({ conversation: 'stored text' });
    });

    it('returns undefined when the message is not found', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_1', _id: 'i-inst_1' });
      instanceRepository.items.set(inst._id, inst);

      const getMessage = service.createGetMessage('tenant-1', 'inst_1');
      const result = await getMessage({
        id: 'missing',
        remoteJid: '5511999990000@s.whatsapp.net',
      });

      expect(result).toBeUndefined();
    });
  });
});
