import { logger, type Logger } from '../../logger.js';
import { config } from '../../config.js';
import type { InstanceLeasePort } from '../../domain/ports/instance-lease.js';
import { generateWorkerId } from '../../shared/crypto/index.js';

export interface LeaseManagerOptions {
  leasePort: InstanceLeasePort;
  logger?: Logger;
}

export class LeaseManager {
  private readonly leasePort: InstanceLeasePort;
  private readonly logger: Logger;
  private readonly ownerId: string;
  private readonly heldLeases = new Map<string, string>(); // instanceId → tenantId
  private renewalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LeaseManagerOptions) {
    this.leasePort = options.leasePort;
    this.logger = options.logger ?? logger;
    this.ownerId = generateWorkerId();
  }

  getOwnerId(): string {
    return this.ownerId;
  }

  async acquire(tenantId: string, instanceId: string): Promise<boolean> {
    const ttlMs = config.INSTANCE_LEASE_TTL_MS;
    const lease = await this.leasePort.acquire(tenantId, instanceId, this.ownerId, ttlMs);
    if (!lease) {
      this.logger.warn({ instanceId, ownerId: this.ownerId }, 'failed to acquire instance lease');
      return false;
    }
    this.heldLeases.set(instanceId, tenantId);
    this.logger.debug({ instanceId, leaseUntil: lease.leaseUntil }, 'instance lease acquired');
    return true;
  }

  async release(tenantId: string, instanceId: string): Promise<void> {
    const released = await this.leasePort.release(tenantId, instanceId, this.ownerId);
    if (released) {
      this.heldLeases.delete(instanceId);
      this.logger.debug({ instanceId }, 'instance lease released');
    }
  }

  startRenewal(): void {
    if (this.renewalTimer) return;
    const intervalMs = config.INSTANCE_LEASE_RENEW_INTERVAL_MS;
    this.renewalTimer = setInterval(() => {
      void this.renewAll();
    }, intervalMs);
    this.logger.debug({ intervalMs, count: this.heldLeases.size }, 'lease renewal started');
  }

  stopRenewal(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }
  }

  async releaseAll(): Promise<void> {
    this.stopRenewal();
    const entries = [...this.heldLeases.entries()];
    for (const [instanceId, tenantId] of entries) {
      await this.release(tenantId, instanceId).catch((err: unknown) => {
        this.logger.warn({ err, instanceId }, 'failed to release lease during shutdown');
      });
    }
    this.heldLeases.clear();
  }

  private async renewAll(): Promise<void> {
    const ttlMs = config.INSTANCE_LEASE_TTL_MS;
    for (const [instanceId, tenantId] of this.heldLeases) {
      const renewed = await this.leasePort
        .renew(tenantId, instanceId, this.ownerId, ttlMs)
        .catch(() => false);
      if (!renewed) {
        this.heldLeases.delete(instanceId);
        this.logger.warn({ instanceId }, 'lease renewal failed, lease may have been lost');
      }
    }
  }
}
