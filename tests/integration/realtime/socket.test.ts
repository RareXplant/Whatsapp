import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { logger } from '../../../src/logger.js';
import { SocketService } from '../../../src/interfaces/realtime/socket.service.js';
import { WhatsAppManager } from '../../../src/infrastructure/baileys/WhatsAppManager.js';
import { AuthService } from '../../../src/application/services/auth.service.js';
import { InstanceService } from '../../../src/application/services/instance.service.js';
import { WebhookDispatcher } from '../../../src/infrastructure/webhooks/webhook-dispatcher.js';
import {
  InMemoryApiKeyRepository,
  InMemoryAuthRepository,
  InMemoryInstanceRepository,
  InMemoryTenantRepository,
  InMemoryUserRepository,
  InMemoryWebhookDeliveryRepository,
} from '../../mocks/repositories.js';
import { FakeTransport } from '../../mocks/fake-transport.js';
import { seedTenantAndOwner } from '../../helpers/auth.js';

function onceEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  predicate?: (payload: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for socket event "${event}"`)),
      5000,
    );
    const handler = (payload: T): void => {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler as (payload: unknown) => void);
  });
}

describe('Socket.IO realtime', () => {
  let server: Server;
  let socketService: SocketService;
  let runtimeMap: Map<string, FakeTransport>;
  let baseUrl: string;
  let tenantId: string;
  let instanceId: string;
  let token: string;
  let testSecret: string;

  beforeAll(async () => {
    const tenantRepository = new InMemoryTenantRepository();
    const userRepository = new InMemoryUserRepository();
    const apiKeyRepository = new InMemoryApiKeyRepository();
    const instanceRepository = new InMemoryInstanceRepository();
    const webhookDeliveryRepository = new InMemoryWebhookDeliveryRepository();
    const authRepository = new InMemoryAuthRepository();

    const authService = new AuthService({
      userRepository,
      apiKeyRepository,
      tenantRepository,
      logger,
    });
    socketService = new SocketService({ authService, instanceRepository, logger });

    server = createServer();
    socketService.init(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const webhookDispatcher = new WebhookDispatcher({
      repository: webhookDeliveryRepository,
      getWebhookSecret: async () => null,
      timeoutMs: 500,
      maxRetries: 1,
      baseRetryMs: 5,
      maxRetryMs: 10,
      logger,
    });

    runtimeMap = new Map<string, FakeTransport>();
    const sendRuntimeEvent = socketService.createRuntimeEventForwarder(async (iid: string) => {
      const instance = await instanceRepository.findByInstanceId(iid);
      return instance ? instance.tenantId : null;
    });

    const whatsAppManager = new WhatsAppManager({
      authRepository,
      logger,
      sendRuntimeEvent,
      transportFactory: (opts) => {
        const transport = new FakeTransport({
          tenantId: opts.tenantId,
          instanceId: opts.instanceId,
        });
        runtimeMap.set(opts.instanceId, transport);
        return transport as unknown as never;
      },
    });

    const instanceService = new InstanceService({
      instanceRepository,
      whatsAppManager,
      webhookDispatcher,
      logger,
    });

    const seeded = await seedTenantAndOwner(tenantRepository, userRepository, {
      email: 'socket-owner@example.com',
    });
    tenantId = seeded.tenantId;
    testSecret = seeded.password;

    const login = await authService.login(seeded.email, seeded.password);
    token = login.token;

    const created = (await instanceService.createInstance(tenantId, seeded.userId, {
      name: 'Socket Instance',
    })) as { instanceId: string };
    instanceId = created.instanceId;
  });

  afterAll(async () => {
    socketService.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('authenticated client connects and joins the tenant room', async () => {
    const client = createClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    const qrReceived = onceEvent(client, 'instance.qr');
    const runtime = runtimeMap.get(instanceId);
    expect(runtime).toBeDefined();
    runtime?.emitQr('socket-test-qr', 30);

    const payload = await qrReceived;
    expect(payload).toMatchObject({
      instanceId,
      qr: 'socket-test-qr',
      ttl: 30,
    });

    client.disconnect();
  });

  it('socket joins the instance room and receives instance-scoped events after subscribing', async () => {
    const client = createClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    const subResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client.emit('subscribe-instance', instanceId, (ack: { ok: boolean; error?: string }) =>
        resolve(ack),
      );
    });
    expect(subResult.ok).toBe(true);

    const scopedReceived = onceEvent(client, 'test.scoped');
    socketService.emitToInstance(tenantId, instanceId, 'test.scoped', {
      instanceId,
      consumer: 'test',
    });

    const payload = await scopedReceived;
    expect(payload).toMatchObject({ instanceId, consumer: 'test' });

    client.disconnect();
  });

  it('unauthenticated connection is rejected', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
    });

    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', (err: Error) => resolve(err));
    });
    expect(error).toBeDefined();
    client.disconnect();
  });
});
