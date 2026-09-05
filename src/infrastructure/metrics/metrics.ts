import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config.js';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const WEBHOOK_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed by the API gateway.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latency of HTTP requests handled by the API gateway.',
  labelNames: ['method', 'route'] as const,
  buckets: HTTP_BUCKETS,
  registers: [metricsRegistry],
});

const activeInstances = new Gauge({
  name: 'active_instances',
  help: 'Number of WhatsApp instances currently registered in the runtime.',
  registers: [metricsRegistry],
});

const connectedInstances = new Gauge({
  name: 'connected_instances',
  help: 'Number of WhatsApp instances currently connected to the gateway.',
  registers: [metricsRegistry],
});

const reconnectAttemptsTotal = new Counter({
  name: 'reconnect_attempts_total',
  help: 'Total number of WhatsApp reconnect attempts per instance.',
  labelNames: ['instance_id'] as const,
  registers: [metricsRegistry],
});

const messagesReceivedTotal = new Counter({
  name: 'messages_received_total',
  help: 'Total number of inbound WhatsApp messages received per instance.',
  labelNames: ['instance_id'] as const,
  registers: [metricsRegistry],
});

const messagesSentTotal = new Counter({
  name: 'messages_sent_total',
  help: 'Total number of outbound WhatsApp messages sent per instance.',
  labelNames: ['instance_id'] as const,
  registers: [metricsRegistry],
});

const webhookSuccessTotal = new Counter({
  name: 'webhook_success_total',
  help: 'Total number of successful webhook deliveries per event type.',
  labelNames: ['event'] as const,
  registers: [metricsRegistry],
});

const webhookFailureTotal = new Counter({
  name: 'webhook_failure_total',
  help: 'Total number of failed webhook deliveries per event type.',
  labelNames: ['event'] as const,
  registers: [metricsRegistry],
});

const webhookDurationSeconds = new Histogram({
  name: 'webhook_duration_seconds',
  help: 'Latency of outbound webhook delivery attempts per event type.',
  labelNames: ['event'] as const,
  buckets: WEBHOOK_BUCKETS,
  registers: [metricsRegistry],
});

const authStateReadsTotal = new Counter({
  name: 'auth_state_reads_total',
  help: 'Total number of Baileys auth state reads per storage category.',
  labelNames: ['category'] as const,
  registers: [metricsRegistry],
});

const authStateWritesTotal = new Counter({
  name: 'auth_state_writes_total',
  help: 'Total number of Baileys auth state writes per storage category.',
  labelNames: ['category'] as const,
  registers: [metricsRegistry],
});

const databaseErrorsTotal = new Counter({
  name: 'database_errors_total',
  help: 'Total number of database errors per operation.',
  labelNames: ['operation'] as const,
  registers: [metricsRegistry],
});

export function recordHttpRequest(method: string, route: string, statusCode: number): void {
  httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
}

export function recordHttpRequestDuration(
  method: string,
  route: string,
  durationSeconds: number,
): void {
  httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
}

export function setActiveInstances(count: number): void {
  activeInstances.set(count);
}

export function setConnectedInstances(count: number): void {
  connectedInstances.set(count);
}

export function incReconnectAttempt(instanceId: string): void {
  reconnectAttemptsTotal.inc({ instance_id: instanceId });
}

export function incMessageReceived(instanceId: string): void {
  messagesReceivedTotal.inc({ instance_id: instanceId });
}

export function incMessageSent(instanceId: string): void {
  messagesSentTotal.inc({ instance_id: instanceId });
}

export function incWebhookSuccess(event: string): void {
  webhookSuccessTotal.inc({ event });
}

export function incWebhookFailure(event: string): void {
  webhookFailureTotal.inc({ event });
}

export function observeWebhookDuration(event: string, durationSeconds: number): void {
  webhookDurationSeconds.observe({ event }, durationSeconds);
}

export function incAuthStateRead(category: string): void {
  authStateReadsTotal.inc({ category });
}

export function incAuthStateWrite(category: string): void {
  authStateWritesTotal.inc({ category });
}

export function incDatabaseError(operation: string): void {
  databaseErrorsTotal.inc({ operation });
}

export function getMetrics(): Promise<Awaited<ReturnType<Registry['getMetricsAsJSON']>>> {
  return metricsRegistry.getMetricsAsJSON();
}

export function resetMetrics(): void {
  metricsRegistry.resetMetrics();
}

export function metricsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  if (!config.METRICS_ENABLED) {
    res
      .status(404)
      .json({ success: false, error: { code: 'NOT_FOUND', message: 'metrics disabled' } });
    return;
  }

  metricsRegistry
    .metrics()
    .then((body: string) => {
      res.setHeader('Content-Type', metricsRegistry.contentType);
      res.end(body);
    })
    .catch(next);
}
