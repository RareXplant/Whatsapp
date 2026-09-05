import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import type { WebhookDeliveryRepository, WebhookDispatcherPort } from '../../domain/ports/index.js';
import { SsrfError } from '../../shared/errors/index.js';
import { generateDeliveryId } from '../../shared/crypto/index.js';
import { exponentialBackoff } from '../../shared/utils/index.js';
import { logger as sharedLogger, type Logger } from '../../logger.js';
import { config } from '../../config.js';
import {
  incWebhookFailure,
  incWebhookSuccess,
  observeWebhookDuration,
} from '../metrics/metrics.js';

const MAX_RESPONSE_LOG_LENGTH = 500;
const MAX_PENDING_RETRIES = 100;

const HTTP_SCHEMES = new Set(['http:', 'https:']);

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, string]> = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.0.2.0', '192.0.2.255'],
  ['192.88.99.0', '192.88.99.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['198.51.100.0', '198.51.100.255'],
  ['203.0.113.0', '203.0.113.255'],
  ['224.0.0.0', '239.255.255.255'],
  ['240.0.0.0', '255.255.255.255'],
];

const BLOCKED_IPV6_PREFIXES: ReadonlyArray<string> = [
  '::1',
  '::',
  '::ffff:',
  'fc',
  'fd',
  'fe80',
  'fe9',
  'fea',
  'feb',
  'ff',
  '2001:db8:',
  '2001:10:',
  '64:ff9b:',
];

export interface WebhookDispatcherOptions {
  repository: WebhookDeliveryRepository;
  getWebhookSecret?: (tenantId: string, instanceId: string) => Promise<string | null>;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  logger?: Logger;
}

interface AttemptResult {
  ok: boolean;
  statusCode: number;
  responseBody: string;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((octet) => Number.parseInt(octet, 10));
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  );
}

function isIpv4AddressBlocked(ip: string): boolean {
  const value = ipv4ToInt(ip);
  for (const [start, end] of BLOCKED_IPV4_RANGES) {
    const startValue = ipv4ToInt(start);
    const endValue = ipv4ToInt(end);
    if (value >= startValue && value <= endValue) return true;
  }
  return false;
}

function isIpv6AddressBlocked(ip: string): boolean {
  const lower = ip.toLowerCase();

  const v4Mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Mapped) return isIpv4AddressBlocked(v4Mapped[1] ?? '');

  const v4Compatible = lower.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Compatible) return isIpv4AddressBlocked(v4Compatible[1] ?? '');

  for (const prefix of BLOCKED_IPV6_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isIpv4AddressBlocked(ip);
  if (family === 6) return isIpv6AddressBlocked(ip);
  return true;
}

async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(rawUrl);
  }

  if (!HTTP_SCHEMES.has(parsed.protocol)) {
    throw new SsrfError(rawUrl);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname.length === 0) throw new SsrfError(rawUrl);

  const ipVersion = net.isIP(hostname);
  if (ipVersion > 0) {
    if (isBlockedAddress(hostname)) throw new SsrfError(rawUrl);
    return;
  }

  let addresses: dns.LookupAddress[] = [];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new SsrfError(rawUrl);
  }

  if (addresses.length === 0) throw new SsrfError(rawUrl);
  for (const address of addresses) {
    if (isBlockedAddress(address.address)) throw new SsrfError(rawUrl);
  }
}

export class WebhookDispatcher implements WebhookDispatcherPort {
  private readonly repository: WebhookDeliveryRepository;
  private readonly getWebhookSecret: (
    tenantId: string,
    instanceId: string,
  ) => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly logger: Logger;

  constructor(options: WebhookDispatcherOptions) {
    this.repository = options.repository;
    this.getWebhookSecret =
      options.getWebhookSecret ??
      (async () => {
        this.logger.warn('no webhook secret resolver configured; retries will not be signed');
        return null;
      });
    this.timeoutMs = options.timeoutMs ?? config.WEBHOOK_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? config.WEBHOOK_MAX_RETRIES;
    this.baseRetryMs = options.baseRetryMs ?? config.WEBHOOK_BASE_RETRY_MS;
    this.maxRetryMs = options.maxRetryMs ?? config.WEBHOOK_MAX_RETRY_MS;
    this.logger = options.logger ?? sharedLogger;
  }

  async dispatch(
    tenantId: string,
    instanceId: string,
    url: string,
    secret: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await assertSafeWebhookUrl(url);

    const deliveryId = generateDeliveryId();
    const record = await this.repository.create({
      tenantId,
      instanceId,
      deliveryId,
      event,
      url,
      payload: { ...payload },
      status: 'pending',
      attempts: 0,
    });

    this.logger.info(
      {
        deliveryId,
        event,
        instanceId,
        tenantId,
        host: new URL(url).hostname,
      },
      'webhook dispatch started',
    );

    await this.attemptAndRecord(record._id, url, secret, event, payload, 0);
  }

  async retryPending(): Promise<void> {
    const now = new Date();
    const due = await this.repository.findPendingRetries(now, MAX_PENDING_RETRIES);

    for (const record of due) {
      const deliveryId = record._id;
      const secret =
        (await this.getWebhookSecret(record.tenantId, record.instanceId).catch(() => null)) ?? '';

      this.logger.info(
        { deliveryId, event: record.event, instanceId: record.instanceId },
        'retrying pending webhook',
      );

      const recordPayload =
        record.payload && typeof record.payload === 'object'
          ? (record.payload as Record<string, unknown>)
          : {};

      void this.attemptAndRecord(
        deliveryId,
        record.url,
        secret,
        record.event,
        recordPayload,
        record.attempts ?? 0,
      ).catch((err: unknown) => {
        this.logger.error({ err, deliveryId, event: record.event }, 'pending webhook retry failed');
      });
    }
  }

  private async attemptAndRecord(
    deliveryId: string,
    url: string,
    secret: string,
    event: string,
    payload: Record<string, unknown>,
    completedAttempts: number,
  ): Promise<void> {
    const attempt = completedAttempts + 1;
    const startedAt = performance.now();
    const result = await this.performAttempt(url, secret, event, deliveryId, payload);
    const durationSeconds = (performance.now() - startedAt) / 1000;

    observeWebhookDuration(event, durationSeconds);

    if (result.ok) {
      incWebhookSuccess(event);
      this.logger.info(
        {
          deliveryId,
          event,
          attempt,
          statusCode: result.statusCode,
          durationMs: Math.round(durationSeconds * 1000),
        },
        'webhook delivery succeeded',
      );

      await this.repository.updateStatus(deliveryId, {
        status: 'success',
        statusCode: result.statusCode,
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        response: result.responseBody.slice(0, MAX_RESPONSE_LOG_LENGTH) || null,
      });
      return;
    }

    incWebhookFailure(event);
    this.logger.warn(
      {
        deliveryId,
        event,
        attempt,
        statusCode: result.statusCode,
        response: result.responseBody.slice(0, MAX_RESPONSE_LOG_LENGTH),
      },
      'webhook delivery attempt failed',
    );

    if (attempt < this.maxRetries) {
      const nextAttemptAt = new Date(
        Date.now() + exponentialBackoff(attempt, this.baseRetryMs, this.maxRetryMs),
      );
      await this.repository.updateStatus(deliveryId, {
        status: 'retrying',
        statusCode: result.statusCode === 0 ? null : result.statusCode,
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt,
        response: result.responseBody.slice(0, MAX_RESPONSE_LOG_LENGTH) || null,
      });
    } else {
      await this.repository.updateStatus(deliveryId, {
        status: 'failed',
        statusCode: result.statusCode === 0 ? null : result.statusCode,
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        response: result.responseBody.slice(0, MAX_RESPONSE_LOG_LENGTH) || null,
      });
    }
  }

  private async performAttempt(
    url: string,
    secret: string,
    event: string,
    deliveryId: string,
    payload: Record<string, unknown>,
  ): Promise<AttemptResult> {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-WA-Signature': signature,
      'X-WA-Event': event,
      'X-WA-Delivery-Id': deliveryId,
      'X-WA-Timestamp': String(Math.floor(Date.now() / 1000)),
      'User-Agent': 'whatsapp-multi-gateway/1.0.0',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status >= 300 && response.status < 400) {
        return {
          ok: false,
          statusCode: response.status,
          responseBody: 'redirects are not allowed for webhook delivery',
        };
      }

      const responseBody = await response.text();
      return { ok: response.ok, statusCode: response.status, responseBody };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown delivery error';
      return { ok: false, statusCode: 0, responseBody: message };
    }
  }
}

export function signWebhookPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = signWebhookPayload(secret, body);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
