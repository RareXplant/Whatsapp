export type AuditResult = 'success' | 'failure';

export interface AuditLog {
  _id: string;
  tenantId: string;
  userId: string | null;
  apiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  timestamp: Date;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  result: AuditResult;
  details: Record<string, unknown> | null;
  createdAt: Date;
}
