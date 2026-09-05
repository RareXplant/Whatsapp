import { logger, type Logger } from '../../logger.js';
import type { AuditLogRepository } from '../../domain/ports/index.js';
import type { AuditResult } from '../../domain/entities/index.js';

export interface RecordAuditParams {
  userId?: string | null;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  result?: AuditResult;
  details?: Record<string, unknown> | null;
}

export interface AuditServiceOptions {
  auditLogRepository: AuditLogRepository;
  logger?: Logger;
}

export class AuditService {
  private readonly auditLogRepository: AuditLogRepository;
  private readonly logger: Logger;

  constructor(options: AuditServiceOptions) {
    this.auditLogRepository = options.auditLogRepository;
    this.logger = options.logger ?? logger;
  }

  async record(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string | null,
    params: RecordAuditParams = {},
  ): Promise<void> {
    const entry = await this.auditLogRepository.create({
      tenantId,
      userId: params.userId ?? null,
      apiKeyId: null,
      action,
      resourceType,
      resourceId,
      requestId: params.requestId ?? '',
      ipAddress: params.ipAddress ?? '',
      userAgent: params.userAgent ?? '',
      result: params.result ?? 'success',
      details: params.details ?? null,
    });

    this.logger.debug(
      {
        tenantId,
        action,
        resourceType,
        resourceId,
        auditLogId: entry._id,
      },
      'audit log recorded',
    );
  }
}
