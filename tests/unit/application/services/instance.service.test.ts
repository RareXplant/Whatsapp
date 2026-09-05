import { describe, expect, it } from 'vitest';
import { InstanceService } from '../../../../src/application/services/instance.service.js';
import { WhatsAppManager } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import { WebhookDispatcher } from '../../../../src/infrastructure/webhooks/webhook-dispatcher.js';
import type { TransportFactory } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { BaileysTransport } from '../../../../src/infrastructure/baileys/BaileysTransport.js';
import {
  InstanceNotConnectedError,
  InstanceNotFoundError,
  NotFoundError,
} from '../../../../src/shared/errors/index.js';
import { FakeTransport } from '../../../mocks/fake-transport.js';
import {
  InMemoryAuthRepository,
  InMemoryInstanceRepository,
  InMemoryWebhookDeliveryRepository,
} from '../../../mocks/repositories.js';
import { makeInstance } from '../../../helpers/factories.js';

function setup() {
  const authRepository = new InMemoryAuthRepository();
  const instanceRepository = new InMemoryInstanceRepository();
  const webhookDeliveryRepository = new InMemoryWebhookDeliveryRepository();
  const transports: FakeTransport[] = [];

  const transportFactory: TransportFactory = () => {
    const t = new FakeTransport({ tenantId: 'tenant-1', instanceId: 'inst_1' });
    transports.push(t);
    return t as unknown as BaileysTransport;
  };

  const whatsAppManager = new WhatsAppManager({
    authRepository,
    transportFactory,
  });

  const webhookDispatcher = new WebhookDispatcher({
    repository: webhookDeliveryRepository,
    getWebhookSecret: async () => null,
    timeoutMs: 500,
    maxRetries: 1,
    baseRetryMs: 5,
    maxRetryMs: 10,
  });

  const service = new InstanceService({
    instanceRepository,
    whatsAppManager,
    webhookDispatcher,
  });

  return {
    service,
    instanceRepository,
    whatsAppManager,
    webhookDispatcher,
    webhookDeliveryRepository,
    transports,
  };
}

describe('InstanceService', () => {
  describe('createInstance', () => {
    it('creates an instance and runtime', async () => {
      const { service, instanceRepository, whatsAppManager, transports } = setup();

      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'My Instance',
        webhookUrl: 'https://example.com/hook',
      })) as {
        instanceId: string;
        status: string;
        webhookSecret: string | null;
        tenantId: string;
        _id: string;
      };

      expect(created.tenantId).toBe('tenant-1');
      expect(created.instanceId.startsWith('inst_')).toBe(true);
      expect(created.status).toBe('created');
      expect(created.webhookSecret).toBeTruthy();

      const stored = instanceRepository.items.get(created._id);
      expect(stored).toBeDefined();

      const runtime = whatsAppManager.getInstance(created.instanceId);
      expect(runtime).toBeDefined();
      expect(transports[0].isConnected()).toBe(true);
    });

    it('generates a pairing code when usePairingCode and phoneNumber are provided', async () => {
      const { service, instanceRepository, transports } = setup();

      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'Pairing Instance',
        usePairingCode: true,
        phoneNumber: '5511999990000',
      })) as { _id: string; instanceId: string };

      const instance = instanceRepository.items.get(created._id);
      expect(instance?.pairingCode).toBe('FAAKE-PAIRING-CODE');
      expect(instance?.pairingPhoneNumber).toBe('5511999990000');
      expect(transports[0].pairingRequests).toContain('5511999990000');
    });
  });

  describe('getInstance', () => {
    it('returns an instance for the owner tenant', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'inst-a' });
      instanceRepository.items.set('inst-a', inst);

      const result = (await service.getInstance('tenant-1', 'inst_a')) as { _id: string };
      expect(result._id).toBe('inst-a');
    });

    it('throws InstanceNotFoundError for another tenant', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-other', instanceId: 'inst_b', _id: 'inst-b' });
      instanceRepository.items.set('inst-b', inst);

      await expect(service.getInstance('tenant-1', 'inst_b')).rejects.toBeInstanceOf(
        InstanceNotFoundError,
      );
    });
  });

  describe('listInstances', () => {
    it('only returns the tenant instances', async () => {
      const { service, instanceRepository } = setup();
      instanceRepository.items.set(
        'a',
        makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'a' }),
      );
      instanceRepository.items.set(
        'b',
        makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_b', _id: 'b' }),
      );
      instanceRepository.items.set(
        'c',
        makeInstance({ tenantId: 'other-tenant', instanceId: 'inst_c', _id: 'c' }),
      );

      const result = (await service.listInstances('tenant-1')) as Array<{ _id: string }>;
      expect(result.map((i) => i._id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('disconnectInstance', () => {
    it('marks status disconnected and disconnects the transport', async () => {
      const { service, instanceRepository, transports } = setup();
      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'X',
      })) as { _id: string; instanceId: string };

      await service.disconnectInstance('tenant-1', created.instanceId);

      const instance = instanceRepository.items.get(created._id);
      expect(instance?.status).toBe('disconnected');
      expect(transports[0].isConnected()).toBe(false);
    });
  });

  describe('reconnectInstance', () => {
    it('calls connect again and updates status to connecting', async () => {
      const { service, instanceRepository, transports } = setup();
      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'X',
      })) as { _id: string; instanceId: string };

      await service.disconnectInstance('tenant-1', created.instanceId);

      await service.reconnectInstance('tenant-1', created.instanceId);

      const instance = instanceRepository.items.get(created._id);
      expect(instance?.status).toBe('connecting');
      expect(transports[0].connectAttempts).toBe(2);
    });
  });

  describe('logoutInstance', () => {
    it('sets status logged_out and calls transport.logout', async () => {
      const { service, instanceRepository, transports } = setup();
      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'X',
      })) as { _id: string; instanceId: string };

      await service.logoutInstance('tenant-1', created.instanceId);

      const instance = instanceRepository.items.get(created._id);
      expect(instance?.status).toBe('logged_out');
      expect(transports[0].logoutCalls).toBe(1);
    });
  });

  describe('deleteInstance', () => {
    it('transitions through deleting and removes the runtime', async () => {
      const { service, instanceRepository, whatsAppManager } = setup();
      const created = (await service.createInstance('tenant-1', 'user-1', {
        name: 'X',
      })) as { _id: string; instanceId: string };

      await service.deleteInstance('tenant-1', created.instanceId);

      expect(instanceRepository.items.has(created._id)).toBe(false);
      expect(whatsAppManager.getInstance(created.instanceId)).toBeUndefined();
    });
  });

  describe('updateWebhook', () => {
    it('persists webhook url, preserving the existing secret', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({
        tenantId: 'tenant-1',
        instanceId: 'inst_a',
        _id: 'inst-a',
        webhookSecret: 'old-secret',
      });
      instanceRepository.items.set('inst-a', inst);

      const updated = (await service.updateWebhook('tenant-1', 'inst_a', {
        webhookUrl: 'https://example.com/new-hook',
      })) as { webhookUrl: string; webhookSecret: string };

      expect(updated.webhookUrl).toBe('https://example.com/new-hook');
      expect(updated.webhookSecret).toBe('old-secret');
      expect(instanceRepository.items.get('inst-a')?.webhookUrl).toBe(
        'https://example.com/new-hook',
      );
    });

    it('regenerates a secret when the instance has none', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({
        tenantId: 'tenant-1',
        instanceId: 'inst_a',
        _id: 'inst-a',
        webhookSecret: null,
      });
      instanceRepository.items.set('inst-a', inst);

      const updated = (await service.updateWebhook('tenant-1', 'inst_a', {
        webhookUrl: 'https://example.com/new-hook',
      })) as { webhookSecret: string };

      expect(updated.webhookSecret).toBeTruthy();
      expect(updated.webhookSecret).not.toBeNull();
    });

    it('uses the provided webhook secret', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'inst-a' });
      instanceRepository.items.set('inst-a', inst);

      const updated = (await service.updateWebhook('tenant-1', 'inst_a', {
        webhookUrl: 'https://example.com/hook',
        webhookSecret: 'my-custom-secret',
      })) as { webhookSecret: string };

      expect(updated.webhookSecret).toBe('my-custom-secret');
    });
  });

  describe('testWebhook', () => {
    it('throws NotFoundError when webhook config is missing', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'inst-a' });
      instanceRepository.items.set('inst-a', inst);

      await expect(service.testWebhook('tenant-1', 'inst_a')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('requestPairingCode', () => {
    it('throws InstanceNotConnectedError when there is no runtime', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'inst-a' });
      instanceRepository.items.set('inst-a', inst);

      await expect(
        service.requestPairingCode('tenant-1', 'inst_a', '5511999990000'),
      ).rejects.toBeInstanceOf(InstanceNotConnectedError);
    });
  });

  describe('getChats', () => {
    it('throws InstanceNotConnectedError on an unconnected runtime', async () => {
      const { service, instanceRepository } = setup();
      const inst = makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'inst-a' });
      instanceRepository.items.set('inst-a', inst);

      await expect(service.getChats('tenant-1', 'inst_a')).rejects.toBeInstanceOf(
        InstanceNotConnectedError,
      );
    });
  });
});
