export type AuthKeyCategory = 'pre-key' | 'session' | 'sender-key' | 'app-state-sync-key';

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
