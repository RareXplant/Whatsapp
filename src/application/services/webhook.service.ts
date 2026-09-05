import { logger, type Logger } from '../../logger.js';
import type {
  InstanceRepository,
  WebhookDeliveryRepository,
  WebhookDispatcherPort,
} from '../../domain/ports/index.js';
import { InstanceNotFoundError, WebhookDeliveryError } from '../../shared/errors/index.js';
import { generateDeliveryId, signWebhookPayload } from '../../shared/crypto/index.js';

export interface WebhookServiceOptions {
  webhookDispatcher: WebhookDispatcherPort;
  instanceRepository: InstanceRepository;
  webhookDeliveryRepository: WebhookDeliveryRepository;
  logger?: Logger;
}

export class WebhookService {
  private readonly webhookDispatcher: WebhookDispatcherPort;
  private readonly instanceRepository: InstanceRepository;
  private readonly webhookDeliveryRepository: WebhookDeliveryRepository;
  private readonly logger: Logger;

  constructor(options: WebhookServiceOptions) {
    this.webhookDispatcher = options.webhookDispatcher;
    this.instanceRepository = options.instanceRepository;
    this.webhookDeliveryRepository = options.webhookDeliveryRepository;
    this.logger = options.logger ?? logger;
  }

  async deliver(
    tenantId: string,
    instanceId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance || instance.tenantId !== tenantId) {
      throw new InstanceNotFoundError(instanceId);
    }

    if (!instance.webhookUrl || !instance.webhookSecret) {
      this.logger.debug(
        { tenantId, instanceId, event },
        'no webhook configured for instance, skipping delivery',
      );
      return;
    }

    const deliveryId = this.createDeliveryId();

    await this.webhookDeliveryRepository.create({
      tenantId,
      instanceId,
      deliveryId,
      event,
      url: instance.webhookUrl,
      payload,
      status: 'pending',
      attempts: 0,
    });

    this.logger.info({ tenantId, instanceId, deliveryId, event }, 'webhook delivery queued');
  }

  createDeliveryId(): string {
    return generateDeliveryId();
  }

  async testDelivery(tenantId: string, instanceUrl: string, secret: string): Promise<void> {
    const testPayload: Record<string, unknown> = {
      event: 'test',
      timestamp: new Date().toISOString(),
    };

    try {
      await this.webhookDispatcher.dispatch(tenantId, '', instanceUrl, secret, 'test', testPayload);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      this.logger.error({ err, url: instanceUrl }, 'test webhook delivery failed');
      throw new WebhookDeliveryError(instanceUrl, reason);
    }

    this.logger.info({ url: instanceUrl }, 'test webhook delivered');
  }

  /** Build a signed test payload that mirrors the wire format of real deliveries. */
  buildSignedTestPayload(secret: string): { payload: string; signature: string } {
    const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString() });
    const signature = signWebhookPayload(payload, secret);
    return { payload, signature };
  }
}
