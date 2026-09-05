import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  signWebhookPayload,
  WebhookDispatcher,
} from '../../../../src/infrastructure/webhooks/webhook-dispatcher.js';
import { SsrfError } from '../../../../src/shared/errors/index.js';
import { InMemoryWebhookDeliveryRepository } from '../../../../tests/mocks/repositories.js';

const TENANT = 'tenant_1';
const INSTANCE = 'inst_1';
const WEBHOOK_URL = 'http://93.184.216.34:1/hook';

interface DispatcherOptions {
  maxRetries?: number;
  getWebhookSecret?: (tenantId: string, instanceId: string) => Promise<string | null>;
}

function makeDispatcher(
  repository: InMemoryWebhookDeliveryRepository,
  options: DispatcherOptions = {},
): WebhookDispatcher {
  return new WebhookDispatcher({
    repository,
    getWebhookSecret: options.getWebhookSecret ?? (async () => 'resolver-secret'),
    timeoutMs: 2000,
    maxRetries: options.maxRetries ?? 2,
    baseRetryMs: 10,
    maxRetryMs: 50,
  });
}

function capturedHeaders(init: unknown): Record<string, string> {
  return (init as RequestInit).headers as Record<string, string>;
}

function stubFetchResponse(status: number, body = ''): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async (_input: string | URL, _init?: RequestInit) => new Response(body, { status }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebhookDispatcher', () => {
  it('delivers successfully and records the delivery', async () => {
    const repository = new InMemoryWebhookDeliveryRepository();
    const fetchMock = stubFetchResponse(200, 'accepted');

    const payload = { eventData: 'x', n: 1 };
    await makeDispatcher(repository, { maxRetries: 3 }).dispatch(
      TENANT,
      INSTANCE,
      WEBHOOK_URL,
      'top-secret',
      'message.received',
      payload,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(WEBHOOK_URL);
    expect((init as RequestInit).method).toBe('POST');
    const headers = capturedHeaders(init);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-WA-Signature']).toBe(
      signWebhookPayload('top-secret', JSON.stringify(payload)),
    );
    expect(headers['X-WA-Event']).toBe('message.received');
    expect(headers['X-WA-Delivery-Id']).toBeDefined();

    expect(repository.items.size).toBe(1);
    const record = [...repository.items.values()][0]!;
    expect(record.tenantId).toBe(TENANT);
    expect(record.instanceId).toBe(INSTANCE);
    expect(record.event).toBe('message.received');
    expect(record.status).toBe('success');
    expect(record.statusCode).toBe(200);
    expect(record.attempts).toBe(1);
    expect(record.payload).toEqual(payload);
    expect(record.payload).not.toBe(payload);
  });

  it('signs the body even when the secret is empty', async () => {
    const repository = new InMemoryWebhookDeliveryRepository();
    const fetchMock = stubFetchResponse(200, '{}');

    const payload = { ok: true };
    await makeDispatcher(repository).dispatch(TENANT, INSTANCE, WEBHOOK_URL, '', 'ping', payload);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(capturedHeaders(init)['X-WA-Signature']).toBe(
      signWebhookPayload('', JSON.stringify(payload)),
    );
  });

  it('retries failed deliveries then marks them failed', async () => {
    const repository = new InMemoryWebhookDeliveryRepository();
    const fetchMock = stubFetchResponse(500, 'server error');

    const dispatcher = makeDispatcher(repository, { maxRetries: 2 });
    await dispatcher.dispatch(TENANT, INSTANCE, WEBHOOK_URL, 'sec', 'event', { a: 1 });

    let record = [...repository.items.values()][0]!;
    expect(record.status).toBe('retrying');
    expect(record.attempts).toBe(1);
    expect(record.statusCode).toBe(500);
    expect(record.nextAttemptAt).toBeInstanceOf(Date);

    await repository.updateStatus(record._id, {
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 60_000),
    });
    await dispatcher.retryPending();

    await vi.waitFor(
      async () => {
        const current = await repository.findById(record._id);
        expect(current?.status).toBe('failed');
      },
      { timeout: 2000 },
    );

    record = (await repository.findById(record._id))!;
    expect(record.attempts).toBeGreaterThanOrEqual(2);
    expect(record.status).toBe('failed');
    expect(record.statusCode).toBe(500);
  });

  it('marks a delivery failed when retries are exhausted on first attempt', async () => {
    const repository = new InMemoryWebhookDeliveryRepository();
    const fetchMock = stubFetchResponse(500, 'nope');

    await makeDispatcher(repository, { maxRetries: 1 }).dispatch(
      TENANT,
      INSTANCE,
      WEBHOOK_URL,
      'sec',
      'event',
      {},
    );

    const record = [...repository.items.values()][0]!;
    expect(record.status).toBe('failed');
    expect(record.attempts).toBe(1);
    expect(record.statusCode).toBe(500);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://192.168.1.10/',
    'http://127.0.0.1:1/',
    'http://localhost:1/',
    'file:///etc/passwd',
  ])('rejects SSRF-prone url %s and creates no delivery', async (url) => {
    const repository = new InMemoryWebhookDeliveryRepository();
    const dispatcher = makeDispatcher(repository);
    const fetchMock = stubFetchResponse(200, 'ok');

    await expect(
      dispatcher.dispatch(TENANT, INSTANCE, url, 'sec', 'event', {}),
    ).rejects.toBeInstanceOf(SsrfError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.items.size).toBe(0);
  });

  it('resumes due pending deliveries via retryPending', async () => {
    const seed = {
      _id: 'delivery_seed',
      tenantId: TENANT,
      instanceId: INSTANCE,
      deliveryId: 'delivery_seed',
      event: 'message.updated',
      url: WEBHOOK_URL,
      payload: { a: 1 },
      status: 'pending' as const,
      statusCode: 500,
      attempts: 1,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(Date.now() - 1_000),
      response: 'previous failure',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = new InMemoryWebhookDeliveryRepository([seed]);
    const fetchMock = stubFetchResponse(200, 'retried ok');

    const dispatcher = makeDispatcher(repository, {
      getWebhookSecret: async () => 'retry-secret',
    });
    await dispatcher.retryPending();

    await vi.waitFor(
      async () => {
        const current = await repository.findById('delivery_seed');
        expect(current?.status).toBe('success');
      },
      { timeout: 2000 },
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(capturedHeaders(init)['X-WA-Signature']).toBe(
      signWebhookPayload('retry-secret', JSON.stringify(seed.payload)),
    );

    const record = (await repository.findById('delivery_seed'))!;
    expect(record.attempts).toBe(2);
    expect(record.statusCode).toBe(200);
  });
});
