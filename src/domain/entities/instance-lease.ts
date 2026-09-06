export interface InstanceLease {
  _id: string;
  tenantId: string;
  instanceId: string;
  ownerId: string;
  leaseUntil: Date;
  heartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
