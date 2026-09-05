import type { Instance, InstanceStatus } from '../entities/index.js';

export interface CreateInstanceInput {
  tenantId: string;
  instanceId: string;
  name: string;
  status: InstanceStatus;
  phoneNumber?: string | null;
  pushName?: string | null;
  profilePictureUrl?: string | null;
  platform?: string | null;
  connectionState?: string | null;
  lastQr?: string | null;
  pairingCode?: string | null;
  pairingPhoneNumber?: string | null;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
}

export type UpdateInstanceInput = Partial<
  Pick<
    Instance,
    | 'name'
    | 'phoneNumber'
    | 'pushName'
    | 'profilePictureUrl'
    | 'platform'
    | 'connectionState'
    | 'lastQr'
    | 'pairingCode'
    | 'pairingPhoneNumber'
    | 'webhookUrl'
    | 'webhookSecret'
    | 'lastConnectedAt'
    | 'lastDisconnectedAt'
    | 'lastErrorAt'
    | 'reconnectAttempts'
  >
>;

export interface InstanceRepository {
  findById(id: string): Promise<Instance | null>;
  findByInstanceId(instanceId: string): Promise<Instance | null>;
  findByTenantId(tenantId: string): Promise<Instance[]>;
  findAll(): Promise<Instance[]>;
  create(input: CreateInstanceInput): Promise<Instance>;
  update(id: string, input: UpdateInstanceInput): Promise<Instance | null>;
  updateStatus(id: string, status: InstanceStatus): Promise<Instance | null>;
  deleteById(id: string): Promise<boolean>;
  countByTenantId(tenantId: string): Promise<number>;
}
