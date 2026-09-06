export type AuthKeyCategory =
  | 'pre-key'
  | 'session'
  | 'sender-key'
  | 'sender-key-memory'
  | 'app-state-sync-key'
  | 'app-state-sync-version'
  | 'lid-mapping'
  | 'device-list'
  | 'tctoken'
  | 'identity-key';

export interface AuthKey {
  _id: string;
  tenantId: string;
  instanceId: string;
  category: AuthKeyCategory;
  keyId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
