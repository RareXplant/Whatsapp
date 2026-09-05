import { describe, expect, it } from 'vitest';
import { AuditService } from '../../../../src/application/services/audit.service.js';
import { InMemoryAuditLogRepository } from '../../../mocks/repositories.js';

function setup() {
  const auditLogRepository = new InMemoryAuditLogRepository();
  const service = new AuditService({ auditLogRepository });
  return { service, auditLogRepository };
}

describe('AuditService', () => {
  it('creates an audit record with the expected fields', async () => {
    const { service, auditLogRepository } = setup();

    await service.record('tenant-1', 'auth.login', 'user', 'user-1', {
      userId: 'user-1',
      requestId: 'req-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      result: 'success',
      details: { ip: '127.0.0.1' },
    });

    expect(auditLogRepository.items.size).toBe(1);
    const log = [...auditLogRepository.items.values()][0];
    expect(log.tenantId).toBe('tenant-1');
    expect(log.userId).toBe('user-1');
    expect(log.action).toBe('auth.login');
    expect(log.resourceType).toBe('user');
    expect(log.resourceId).toBe('user-1');
    expect(log.requestId).toBe('req-1');
    expect(log.ipAddress).toBe('127.0.0.1');
    expect(log.userAgent).toBe('test-agent');
    expect(log.result).toBe('success');
    expect(log.details).toEqual({ ip: '127.0.0.1' });
    expect(log.timestamp).toBeInstanceOf(Date);
  });

  it('uses sensible defaults for omitted fields', async () => {
    const { service, auditLogRepository } = setup();

    await service.record('tenant-1', 'api.key.create', 'api_key', 'key-1');

    const log = [...auditLogRepository.items.values()][0];
    expect(log.userId).toBeNull();
    expect(log.apiKeyId).toBeNull();
    expect(log.requestId).toBe('');
    expect(log.ipAddress).toBe('');
    expect(log.userAgent).toBe('');
    expect(log.result).toBe('success');
    expect(log.details).toBeNull();
  });
});
