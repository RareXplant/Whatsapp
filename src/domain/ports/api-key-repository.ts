import type { ApiKey } from '../entities/index.js';

export interface CreateApiKeyInput {
  tenantId: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface ApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  findByTenantId(tenantId: string): Promise<ApiKey[]>;
  create(input: CreateApiKeyInput): Promise<ApiKey>;
  deleteById(id: string): Promise<boolean>;
  updateLastUsed(id: string, lastUsedAt: Date): Promise<ApiKey | null>;
}
