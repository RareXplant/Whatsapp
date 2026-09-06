import type { InstanceLease } from '../entities/instance-lease.js';

export interface InstanceLeasePort {
  acquire(
    tenantId: string,
    instanceId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<InstanceLease | null>;

  renew(tenantId: string, instanceId: string, ownerId: string, ttlMs: number): Promise<boolean>;

  release(tenantId: string, instanceId: string, ownerId: string): Promise<boolean>;

  findByInstance(tenantId: string, instanceId: string): Promise<InstanceLease | null>;
}
