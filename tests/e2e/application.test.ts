import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { io as ioClient, type Socket as IOSocket } from 'socket.io-client';
import { v4 as uuid } from 'uuid';

import { createApplication, shutdownApplication } from '../../src/app.js';
import { TenantModel } from '../../src/infrastructure/database/models/tenant.js';
import { UserModel } from '../../src/infrastructure/database/models/user.js';

import type { ApplicationContext } from '../../src/app.js';

const UNIQUE = uuid().slice(0, 8);
const TENANT_SLUG = `e2e-${UNIQUE}`;
const OWNER_EMAIL = `e2e-owner-${UNIQUE}@example.com`;
const OWNER_PASSWORD = 'Test!Passw0rd#';
const TENANT_NAME = 'E2E Tenant';

let ctx: ApplicationContext;
let jwtToken: string;
let tenantId: string;
let ownerUserId: string;
let serverPort: number;
let plaintextApiKey: string;

function connectSocket(
  port: number,
  token: string,
): Promise<{ socket: IOSocket; error: Error | null }> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const onError = (err: Error) => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      resolve({ socket, error: err });
    };

    const onConnect = () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      resolve({ socket, error: null });
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

describe('application e2e', () => {
  beforeAll(async () => {
    ctx = await createApplication();

    await new Promise<void>((resolve) => ctx.server.listen(0, resolve));
    const addr = ctx.server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 0;

    const tenant = await TenantModel.create({
      name: TENANT_NAME,
      slug: TENANT_SLUG,
    });
    tenantId = String(tenant._id);

    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 4);
    const user = await UserModel.create({
      tenantId: tenant._id,
      email: OWNER_EMAIL,
      passwordHash,
      name: 'E2E Owner',
      role: 'owner',
    });
    ownerUserId = String(user._id);
  }, 30_000);

  afterAll(async () => {
    await ctx.server.close();
    await shutdownApplication(ctx);
  });

  it('GET /health returns 200 with success true', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /ready returns 200 with success true when Mongo is connected', async () => {
    const res = await request(ctx.app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/auth/login with valid credentials returns JWT', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(0);
    expect(res.body.data.user.email).toBe(OWNER_EMAIL);
    expect(res.body.data.tenant.slug).toBe(TENANT_SLUG);

    jwtToken = res.body.data.token;
  });

  it('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: OWNER_EMAIL, password: 'WrongPassword!123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/v1/auth/me with JWT returns the seeded user', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(OWNER_EMAIL);
    expect(res.body.data.user.role).toBe('owner');
    expect(res.body.data.tenant.slug).toBe(TENANT_SLUG);
  });

  it('GET /api/v1/auth/me without auth returns 401', async () => {
    const res = await request(ctx.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/api-keys creates an API key', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'E2E Test Key' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.plaintextKey).toBe('string');
    expect(res.body.data.plaintextKey.startsWith('wag_')).toBe(true);

    plaintextApiKey = res.body.data.plaintextKey;
  });

  it('GET /api/v1/auth/me with X-API-Key returns the same user', async () => {
    const res = await request(ctx.app).get('/api/v1/auth/me').set('x-api-key', plaintextApiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(OWNER_EMAIL);
  });

  it('GET /api/v1/audit with JWT returns audit entries', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.entries)).toBe(true);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);

    const actions = res.body.data.entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('api_key.create');
  });

  it('Socket.IO: connects with valid JWT and receives tenant events', async () => {
    const { socket, error } = await connectSocket(serverPort, jwtToken);
    expect(error).toBeNull();
    expect(socket.connected).toBe(true);

    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for event')), 5000);
      socket.once('test.event', (data: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    ctx.socketService.emitToTenant(tenantId, 'test.event', { instanceId: 'x' });

    const data = await received;
    expect(data.instanceId).toBe('x');

    socket.disconnect();
  });

  it('Socket.IO: rejects connection with bogus token', async () => {
    const { error } = await connectSocket(serverPort, 'definitely-not-a-valid-jwt');
    expect(error).not.toBeNull();
  });
});
