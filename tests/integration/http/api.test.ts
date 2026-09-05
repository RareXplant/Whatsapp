import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestHarness, type TestHarness } from '../../helpers/http.js';
import { seedTenantAndOwner, hashPassword } from '../../helpers/auth.js';
import { FakeTransport } from '../../mocks/fake-transport.js';

interface Credentials {
  token: string;
  tenantId: string;
  userId: string;
  email: string;
}

async function login(
  harness: TestHarness,
  email: string,
  password: string,
): Promise<{ token: string; tenantId: string; userId: string }> {
  const res = await request(harness.app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return {
    token: res.body.data.token,
    tenantId: res.body.data.tenant.id,
    userId: res.body.data.user.id,
  };
}

describe('HTTP API / tenant isolation', () => {
  let harness: TestHarness;
  let tenantA: Credentials;
  let tenantB: Credentials;

  beforeEach(async () => {
    harness = createTestHarness();

    const seededA = await seedTenantAndOwner(harness.tenantRepository, harness.userRepository, {
      email: 'owner-a@example.com',
    });
    const seededB = await seedTenantAndOwner(harness.tenantRepository, harness.userRepository, {
      email: 'owner-b@example.com',
    });

    const loginA = await login(harness, seededA.email, seededA.password);
    const loginB = await login(harness, seededB.email, seededB.password);
    tenantA = { ...loginA, email: seededA.email };
    tenantB = { ...loginB, email: seededB.email };
  });

  it('login returns the success envelope with token and user info', async () => {
    const res = await request(harness.app)
      .post('/api/v1/auth/login')
      .send({ email: tenantA.email, password: 'TestPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.id).toBe(tenantA.userId);
    expect(res.body.data.user.email).toBe(tenantA.email);
    expect(res.body.data.user.role).toBe('owner');
    expect(res.body.data.tenant.id).toBe(tenantA.tenantId);
    expect(res.body.data.tenant.name).toBe('Seeded Tenant');
  });

  it('login with wrong password returns 401 with error envelope', async () => {
    const res = await request(harness.app)
      .post('/api/v1/auth/login')
      .send({ email: tenantA.email, password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('GET /api/v1/auth/me returns the authenticated user and 401 without a token', async () => {
    const res = await request(harness.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tenantA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(tenantA.userId);
    expect(res.body.data.tenant.id).toBe(tenantA.tenantId);

    const noToken = await request(harness.app).get('/api/v1/auth/me');
    expect(noToken.status).toBe(401);
    expect(noToken.body.success).toBe(false);
    expect(noToken.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates instances per tenant and enforces strict tenant isolation on list', async () => {
    const createA = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'Instance A' });
    expect(createA.status).toBe(201);
    expect(createA.body.success).toBe(true);
    expect(createA.body.data.instance.status).toBe('created');
    expect(createA.body.data.instance.name).toBe('Instance A');

    const createB = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Instance B' });
    expect(createB.status).toBe(201);

    const instAId = createA.body.data.instance.instanceId;
    const instBId = createB.body.data.instance.instanceId;

    const listA = await request(harness.app)
      .get('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(listA.status).toBe(200);
    const aIds = listA.body.data.map((i: { instanceId: string }) => i.instanceId);
    expect(aIds).toContain(instAId);
    expect(aIds).not.toContain(instBId);

    const listB = await request(harness.app)
      .get('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(listB.status).toBe(200);
    const bIds = listB.body.data.map((i: { instanceId: string }) => i.instanceId);
    expect(bIds).toContain(instBId);
    expect(bIds).not.toContain(instAId);
  });

  it('GET /api/v1/instances/:id of another tenant returns 404', async () => {
    const createB = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Instance B' });
    const instBId = createB.body.data.instance.instanceId;

    const res = await request(harness.app)
      .get(`/api/v1/instances/${instBId}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /api/v1/instances requires operator+ permission (viewer gets 403)', async () => {
    const viewerPassword = 'ViewerPass123!';
    await harness.userRepository.create({
      tenantId: tenantA.tenantId,
      email: 'viewer-a@example.com',
      passwordHash: await hashPassword(viewerPassword),
      name: 'Viewer A',
      role: 'viewer',
    });
    const viewerLogin = await login(harness, 'viewer-a@example.com', viewerPassword);

    const res = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${viewerLogin.token}`)
      .send({ name: 'Should Fail' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('API key flow: create, authenticate via X-API-Key, delete, then 401', async () => {
    const createKey = await request(harness.app)
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'integration key' });
    expect(createKey.status).toBe(201);
    const plaintextKey = createKey.body.data.plaintextKey;
    expect(plaintextKey.startsWith('wag_')).toBe(true);

    const meViaKey = await request(harness.app)
      .get('/api/v1/auth/me')
      .set('X-API-Key', plaintextKey);
    expect(meViaKey.status).toBe(200);
    expect(meViaKey.body.success).toBe(true);
    expect(meViaKey.body.data.user.id).toBe(tenantA.userId);

    const keyId = createKey.body.data.id;
    const del = await request(harness.app)
      .delete(`/api/v1/auth/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(del.status).toBe(200);
    expect(del.body.data?.deleted).toBe(true);

    const afterDelete = await request(harness.app)
      .get('/api/v1/auth/me')
      .set('X-API-Key', plaintextKey);
    expect(afterDelete.status).toBe(401);
    expect(afterDelete.body.success).toBe(false);
    expect(afterDelete.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/instances/:id/qr returns the emitted QR and 409 when none', async () => {
    const create = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'QR Instance' });
    const instId = create.body.data.instance.instanceId;

    const runtime = harness.getInstanceRuntime(instId) as FakeTransport | null;
    expect(runtime).not.toBeNull();
    runtime?.emitQr('test-qr', 30);

    const withQr = await request(harness.app)
      .get(`/api/v1/instances/${instId}/qr`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(withQr.status).toBe(200);
    expect(withQr.body.success).toBe(true);
    expect(withQr.body.data.qr).toBe('test-qr');

    const createFresh = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'No QR Instance' });
    const noQrId = createFresh.body.data.instance.instanceId;
    const noQr = await request(harness.app)
      .get(`/api/v1/instances/${noQrId}/qr`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(noQr.status).toBe(409);
    expect(noQr.body.success).toBe(false);
    expect(noQr.body.error.code).toBe('CONFLICT');
  });

  it('PUT /api/v1/instances/:id/webhook updates and GET returns config', async () => {
    const create = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'Webhook Instance' });
    const instId = create.body.data.instance.instanceId;

    const put = await request(harness.app)
      .put(`/api/v1/instances/${instId}/webhook`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ webhookUrl: 'https://ex.com/hook', webhookSecret: 'secretttttt' });
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);
    expect(put.body.data.updated).toBe(true);

    const get = await request(harness.app)
      .get(`/api/v1/instances/${instId}/webhook`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.webhookUrl).toBe('https://ex.com/hook');
    expect(get.body.data.hasSecret).toBe(true);
  });

  it('POST /api/v1/instances with empty name returns 400 validation error', async () => {
    const res = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /health returns 200 with success envelope', async () => {
    const res = await request(harness.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('audit endpoint only returns entries for the calling tenant', async () => {
    const createA = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ name: 'Audit A' });
    const instAId = createA.body.data.instance.instanceId;

    const createB = await request(harness.app)
      .post('/api/v1/instances')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Audit B' });
    const instBId = createB.body.data.instance.instanceId;

    const auditA = await request(harness.app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(auditA.status).toBe(200);
    expect(auditA.body.success).toBe(true);

    const entries = auditA.body.data.entries as Array<{
      resourceId: string | null;
      action: string;
    }>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.action === 'instance.create' && e.resourceId === instAId)).toBe(
      true,
    );
    for (const entry of entries) {
      expect(entry.resourceId).not.toBe(instBId);
    }
    expect(entries.some((e) => e.resourceId === instAId)).toBe(true);
  });
});
