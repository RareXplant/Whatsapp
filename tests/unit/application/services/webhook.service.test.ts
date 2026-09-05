import { describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { WebhookService } from '../../../../src/application/services/webhook.service.js';
import type { WebhookDispatcherPort } from '../../../../src/domain/ports/index.js';
import {
  InstanceNotFoundError,
  WebhookDeliveryError,
} from '../../../../src/shared/errors/index.js';
import {
  InMemoryInstanceRepository,
  InMemoryWebhookDeliveryRepository,
} from '../../../mocks/repositories.js';
import { makeInstance } from '../../../helpers/factories.js';

class NetworkDispatcher implements WebhookDispatcherPort {
  async dispatch(
    _tenantId: string,
    _instanceId: string,
    url: string,
    _secret: string,
    _event: string,
    _payload: Record<string, unknown>,
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`unexpected status ${response.status}`);
    }
  }

  async retryPending(): Promise<void> {}
}

function startServer(): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/webhook`,
        close: () =>
          new Promise((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

function setup() {
  const instanceRepository = new InMemoryInstanceRepository();
  const webhookDeliveryRepository = new InMemoryWebhookDeliveryRepository();
  const dispatcher = new NetworkDispatcher();

  const service = new WebhookService({
    webhookDispatcher: dispatcher,
    instanceRepository,
    webhookDeliveryRepository,
  });

  return { service, instanceRepository, webhookDeliveryRepository };
}

describe('WebhookService', () => {
  describe('deliver', () => {
    it('does nothing when the instance has no webhook config', async () => {
      const { service, instanceRepository, webhookDeliveryRepository } = setup();
      instanceRepository.items.set(
        'a',
        makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'a' }),
      );

      await service.deliver('tenant-1', 'inst_a', 'message.received', { foo: 'bar' });

      expect(webhookDeliveryRepository.items.size).toBe(0);
    });

    it('throws InstanceNotFoundError for another tenant', async () => {
      const { service, instanceRepository } = setup();
      instanceRepository.items.set(
        'a',
        makeInstance({ tenantId: 'other-tenant', instanceId: 'inst_a', _id: 'a' }),
      );

      await expect(service.deliver('tenant-1', 'inst_a', 'e', {})).rejects.toBeInstanceOf(
        InstanceNotFoundError,
      );
    });

    it('creates a pending delivery record without dispatching network', async () => {
      const { service, instanceRepository, webhookDeliveryRepository } = setup();
      instanceRepository.items.set(
        'a',
        makeInstance({
          tenantId: 'tenant-1',
          instanceId: 'inst_a',
          _id: 'a',
          webhookUrl: 'https://example.com/hook',
          webhookSecret: 'secret',
        }),
      );

      const dispatchSpy = { called: false };
      const spiedService = new WebhookService({
        webhookDispatcher: {
          dispatch: async () => {
            dispatchSpy.called = true;
          },
          retryPending: async () => {},
        },
        instanceRepository,
        webhookDeliveryRepository,
      });

      await spiedService.deliver('tenant-1', 'inst_a', 'message.received', { foo: 1 });

      expect(webhookDeliveryRepository.items.size).toBe(1);
      const record = [...webhookDeliveryRepository.items.values()][0];
      expect(record.status).toBe('pending');
      expect(record.attempts).toBe(0);
      expect(record.url).toBe('https://example.com/hook');
      // deliver() only persists; the dispatcher does the actual network send
      expect(dispatchSpy.called).toBe(false);
    });
  });

  describe('testDelivery', () => {
    it('succeeds when delivered to a live local server', async () => {
      const { service } = setup();
      const { url, close } = await startServer();
      try {
        await expect(service.testDelivery('tenant-1', url, 'secret')).resolves.toBeUndefined();
      } finally {
        await close();
      }
    });

    it('throws WebhookDeliveryError when the server is down', async () => {
      const { service } = setup();
      const { url, close } = await startServer();
      await close();

      await expect(service.testDelivery('tenant-1', url, 'secret')).rejects.toBeInstanceOf(
        WebhookDeliveryError,
      );
    });
  });
});
