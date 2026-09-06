import pLimit from 'p-limit';
import { logger, type Logger } from '../../logger.js';
import { config } from '../../config.js';
import type { Instance, InstanceStatus } from '../../domain/entities/index.js';
import type { AuthRepository, InstanceRepository } from '../../domain/ports/index.js';
import type { WhatsAppManager } from '../../infrastructure/baileys/WhatsAppManager.js';
import type { LeaseManager } from '../../infrastructure/lease/lease-manager.js';

const EXCLUDED_STATUSES: InstanceStatus[] = ['deleting', 'logged_out'];

export interface StartupServiceOptions {
  instanceRepository: InstanceRepository;
  authRepository: AuthRepository;
  whatsAppManager: WhatsAppManager;
  leaseManager: LeaseManager;
  logger?: Logger;
}

export class StartupService {
  private readonly instanceRepository: InstanceRepository;
  private readonly authRepository: AuthRepository;
  private readonly whatsAppManager: WhatsAppManager;
  private readonly leaseManager: LeaseManager;
  private readonly logger: Logger;

  constructor(options: StartupServiceOptions) {
    this.instanceRepository = options.instanceRepository;
    this.authRepository = options.authRepository;
    this.whatsAppManager = options.whatsAppManager;
    this.leaseManager = options.leaseManager;
    this.logger = options.logger ?? logger;
  }

  /**
   * Reconnect eligible instances on application boot. Instances whose status is
   * 'deleting' or 'logged_out' are excluded, as are instances without saved creds.
   * Each instance is leased before connecting to prevent duplicate connections
   * across nodes.
   */
  async startup(): Promise<number> {
    const eligible = await this.listEligibleInstances();

    if (eligible.length === 0) {
      this.logger.info({ instances: 0 }, 'no instances eligible for startup reconnect');
      return 0;
    }

    this.leaseManager.startRenewal();

    const limit = pLimit(Math.max(1, config.INSTANCE_STARTUP_CONCURRENCY));
    const tasks = eligible.map((instance) => limit(() => this.connectEligibleInstance(instance)));

    const results = await Promise.allSettled(tasks);

    const succeeded = results.filter(
      (result): result is PromiseFulfilledResult<boolean> =>
        result.status === 'fulfilled' && result.value,
    ).length;

    this.logger.info({ total: eligible.length, succeeded }, 'startup reconnect complete');

    return succeeded;
  }

  async shutdown(): Promise<void> {
    await this.leaseManager.releaseAll();
  }

  private async listEligibleInstances(): Promise<Instance[]> {
    const all = await this.instanceRepository.findAll();
    const eligible: Instance[] = [];

    for (const instance of all) {
      if (EXCLUDED_STATUSES.includes(instance.status)) continue;

      const hasCreds = await this.hasSavedCreds(instance);
      if (!hasCreds) {
        this.logger.debug(
          { instanceId: instance.instanceId },
          'instance has no saved creds, skipping startup reconnect',
        );
        continue;
      }

      eligible.push(instance);
    }

    return eligible;
  }

  private async connectEligibleInstance(instance: Instance): Promise<boolean> {
    const acquired = await this.leaseManager.acquire(instance.tenantId, instance.instanceId);
    if (!acquired) {
      this.logger.info(
        { instanceId: instance.instanceId },
        'instance lease held by another node, skipping',
      );
      return false;
    }

    try {
      await this.whatsAppManager.createInstance(instance.tenantId, instance.instanceId);
      await this.instanceRepository.updateStatus(instance._id, 'connecting');
      this.logger.info({ instanceId: instance.instanceId }, 'instance reconnecting on startup');
      return true;
    } catch (err) {
      this.logger.error(
        { err, instanceId: instance.instanceId },
        'failed to reconnect instance on startup',
      );
      await this.leaseManager.release(instance.tenantId, instance.instanceId);
      return false;
    }
  }

  private async hasSavedCreds(instance: Instance): Promise<boolean> {
    try {
      const creds = await this.authRepository.findCreds(instance.tenantId, instance.instanceId);
      return creds !== null;
    } catch (err) {
      this.logger.warn(
        { err, instanceId: instance.instanceId },
        'failed to check saved creds, assuming none',
      );
      return false;
    }
  }
}
