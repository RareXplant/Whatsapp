import type { AuditLog, AuditResult } from '../entities/index.js';

export interface CreateAuditLogInput {
  tenantId: string;
  userId: string | null;
  apiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  result: AuditResult;
  details: Record<string, unknown> | null;
}

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLog>;
  findByTenantId(tenantId: string): Promise<AuditLog[]>;
  findByInstanceId(instanceId: string): Promise<AuditLog[]>;
}
