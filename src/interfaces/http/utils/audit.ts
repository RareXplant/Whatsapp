import type { Request } from 'express';
import type { AuditService } from '../../../application/services/index.js';
import type { AuditResult } from '../../../domain/entities/index.js';

function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Writes an audit log entry for the authenticated request through the
 * AuditService. Never throws: audit failures are logged but must not break the
 * primary request.
 */
export async function writeAuditLog(
  auditService: AuditService,
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string | null,
  result: AuditResult = 'success',
  details: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await auditService.record(req.tenantId, action, resourceType, resourceId, {
      userId: req.userId ?? null,
      requestId: req.requestId,
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? '',
      result,
      details,
    });
  } catch {
    // Audit failures must never break the primary request.
  }
}
