import type { AuthCredential, AuthKey, AuthKeyCategory } from '../entities/index.js';

export interface AuthRepository {
  findCreds(tenantId: string, instanceId: string): Promise<AuthCredential | null>;
  saveCreds(
    tenantId: string,
    instanceId: string,
    creds: Record<string, unknown>,
  ): Promise<AuthCredential>;
  deleteCreds(tenantId: string, instanceId: string): Promise<boolean>;
  findKeys(tenantId: string, instanceId: string, category: AuthKeyCategory): Promise<AuthKey[]>;
  setKeys(
    tenantId: string,
    instanceId: string,
    category: AuthKeyCategory,
    entries: Record<string, Record<string, unknown>>,
  ): Promise<AuthKey[]>;
  deleteKey(tenantId: string, instanceId: string, keyId: string): Promise<boolean>;
}
