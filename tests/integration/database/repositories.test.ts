import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../helpers/db.js';
import {
  TenantModel,
  UserModel,
  ApiKeyModel,
  InstanceModel,
  MessageModel,
  WebhookDeliveryModel,
  AuthCredentialModel,
  AuthKeyModel,
} from '../../../src/infrastructure/database/models/index.js';
import {
  MongoTenantRepository,
  MongoUserRepository,
  MongoApiKeyRepository,
  MongoInstanceRepository,
  MongoMessageRepository,
  MongoWebhookDeliveryRepository,
  MongoAuthRepository,
} from '../../../src/infrastructure/database/repositories/index.js';

describe('Mongo repositories', () => {
  let tenantRepo: MongoTenantRepository;
  let userRepo: MongoUserRepository;
  let apiKeyRepo: MongoApiKeyRepository;
  let instanceRepo: MongoInstanceRepository;
  let messageRepo: MongoMessageRepository;
  let webhookRepo: MongoWebhookDeliveryRepository;
  let authRepo: MongoAuthRepository;

  beforeAll(async () => {
    await connectTestDb();
    tenantRepo = new MongoTenantRepository(TenantModel);
    userRepo = new MongoUserRepository(UserModel);
    apiKeyRepo = new MongoApiKeyRepository(ApiKeyModel);
    instanceRepo = new MongoInstanceRepository(InstanceModel);
    messageRepo = new MongoMessageRepository(MessageModel);
    webhookRepo = new MongoWebhookDeliveryRepository(WebhookDeliveryModel);
    authRepo = new MongoAuthRepository(AuthCredentialModel, AuthKeyModel);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('MongoTenantRepository', () => {
    it('creates, finds by id and slug, and updates', async () => {
      const created = await tenantRepo.create({ name: 'Acme', slug: 'acme' });
      expect(created._id).toBeTruthy();
      expect(created.name).toBe('Acme');

      const byId = await tenantRepo.findById(created._id);
      expect(byId?.slug).toBe('acme');

      const bySlug = await tenantRepo.findBySlug('acme');
      expect(bySlug?._id).toBe(created._id);

      const updated = await tenantRepo.update(created._id, { name: 'Acme Corp' });
      expect(updated?.name).toBe('Acme Corp');
      expect(await tenantRepo.findById(created._id)).not.toBeNull();
    });
  });

  describe('MongoUserRepository', () => {
    it('round-trips CRUD and scopes findByEmail to a tenant', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const userA = await userRepo.create({
        tenantId: tenantA._id,
        email: 'same@example.com',
        passwordHash: 'hash-a',
        name: 'A',
        role: 'owner',
      });
      const userB = await userRepo.create({
        tenantId: tenantB._id,
        email: 'same@example.com',
        passwordHash: 'hash-b',
        name: 'B',
        role: 'operator',
      });

      const scopedA = await userRepo.findByEmail(tenantA._id, 'same@example.com');
      expect(scopedA?._id).toBe(userA._id);
      expect(scopedA?.name).toBe('A');

      const scopedB = await userRepo.findByEmail(tenantB._id, 'same@example.com');
      expect(scopedB?._id).toBe(userB._id);

      expect((await userRepo.findByTenantId(tenantA._id)).length).toBe(1);
      expect((await userRepo.findByTenantId(tenantB._id))[0]._id).toBe(userB._id);

      const foundGlobal = await userRepo.findByEmailGlobal(userA.email);
      expect(foundGlobal).not.toBeNull();

      const updated = await userRepo.update(userA._id, { role: 'admin' });
      expect(updated?.role).toBe('admin');

      expect(await userRepo.deleteById(userB._id)).toBe(true);
      expect(await userRepo.findById(userB._id)).toBeNull();
    });
  });

  describe('MongoApiKeyRepository', () => {
    it('creates, finds by hash, isolates by tenant, updates last used and deletes', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const keyA = await apiKeyRepo.create({
        tenantId: tenantA._id,
        userId: tenantA._id,
        name: 'key-a',
        keyHash: 'hash-a',
        keyPrefix: 'wag_aaa',
        scopes: ['*'],
        expiresAt: null,
      });
      const keyB = await apiKeyRepo.create({
        tenantId: tenantB._id,
        userId: tenantB._id,
        name: 'key-b',
        keyHash: 'hash-b',
        keyPrefix: 'wag_bbb',
        scopes: ['instances.read'],
        expiresAt: null,
      });

      const byHash = await apiKeyRepo.findByKeyHash('hash-a');
      expect(byHash?._id).toBe(keyA._id);

      const tenantAKeys = await apiKeyRepo.findByTenantId(tenantA._id);
      expect(tenantAKeys.map((k) => k._id)).toEqual([keyA._id]);

      const tenantBKeys = await apiKeyRepo.findByTenantId(tenantB._id);
      expect(tenantBKeys.map((k) => k._id)).toEqual([keyB._id]);

      const lastUsed = new Date();
      const updated = await apiKeyRepo.updateLastUsed(keyA._id, lastUsed);
      expect(updated?.lastUsedAt).toEqual(lastUsed);

      expect(await apiKeyRepo.deleteById(keyB._id)).toBe(true);
      expect(await apiKeyRepo.findById(keyB._id)).toBeNull();
    });
  });

  describe('MongoInstanceRepository', () => {
    it('creates, isolates by tenant, updates status, finds all, counts and deletes', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const instA = await instanceRepo.create({
        tenantId: tenantA._id,
        instanceId: 'inst_aaa',
        name: 'A',
        status: 'created',
      });
      const instB = await instanceRepo.create({
        tenantId: tenantB._id,
        instanceId: 'inst_bbb',
        name: 'B',
        status: 'created',
      });

      expect((await instanceRepo.findByInstanceId('inst_aaa'))?._id).toBe(instA._id);
      expect((await instanceRepo.findById(instA._id))?._id).toBe(instA._id);

      const tenantAInstances = await instanceRepo.findByTenantId(tenantA._id);
      expect(tenantAInstances.map((i) => i.instanceId)).toEqual(['inst_aaa']);

      const tenantBInstances = await instanceRepo.findByTenantId(tenantB._id);
      expect(tenantBInstances.map((i) => i.instanceId)).toEqual(['inst_bbb']);

      expect((await instanceRepo.findAll()).length).toBe(2);
      expect(await instanceRepo.countByTenantId(tenantA._id)).toBe(1);
      expect(await instanceRepo.countByTenantId(tenantB._id)).toBe(1);

      const statusUpdated = await instanceRepo.updateStatus(instA._id, 'connected');
      expect(statusUpdated?.status).toBe('connected');

      const updated = await instanceRepo.update(instA._id, { name: 'A2' });
      expect(updated?.name).toBe('A2');

      expect(await instanceRepo.deleteById(instB._id)).toBe(true);
      expect(await instanceRepo.findByInstanceId('inst_bbb')).toBeNull();
    });
  });

  describe('MongoMessageRepository', () => {
    it('creates, finds, updates status, detects duplicates and isolates by tenant', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const base = {
        instanceId: 'inst_aa',
        remoteJid: '5511999990000@s.whatsapp.net',
        participant: null,
        fromMe: false,
        direction: 'inbound' as const,
        timestamp: new Date(),
        messageType: 'text' as const,
        text: 'hello',
        rawMessage: null,
        status: 'pending' as const,
      };

      const msgA = await messageRepo.create({
        tenantId: tenantA._id,
        messageId: 'msg-1',
        ...base,
      });
      await messageRepo.create({
        tenantId: tenantB._id,
        messageId: 'msg-2',
        ...base,
        instanceId: 'inst_bb',
      });

      expect((await messageRepo.findById(msgA._id))?._id).toBe(msgA._id);

      const byJid = await messageRepo.findByInstanceAndRemoteJid(
        'inst_aa',
        '5511999990000@s.whatsapp.net',
      );
      expect(byJid.length).toBe(1);
      expect(byJid[0]._id).toBe(msgA._id);

      const updated = await messageRepo.updateStatus(msgA._id, 'delivered');
      expect(updated?.status).toBe('delivered');

      const duplicate = await messageRepo.findDuplicate(tenantA._id, 'inst_aa', 'msg-1');
      expect(duplicate?._id).toBe(msgA._id);

      const differentTenantDuplicate = await messageRepo.findDuplicate(
        tenantB._id,
        'inst_aa',
        'msg-1',
      );
      expect(differentTenantDuplicate).toBeNull();

      const tenantAMessages = await messageRepo.findByTenantId(tenantA._id);
      expect(tenantAMessages.map((m) => m.messageId)).toEqual(['msg-1']);
      expect((await messageRepo.findByTenantId(tenantB._id)).length).toBe(1);
    });
  });

  describe('MongoWebhookDeliveryRepository', () => {
    it('creates, finds, updates status, isolates by tenant and returns only due retries', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const base = {
        instanceId: 'inst_aa',
        event: 'message.received',
        url: 'https://example.com/hook',
        payload: { ok: true },
        status: 'pending' as const,
      };

      const past = await webhookRepo.create({
        tenantId: tenantA._id,
        deliveryId: 'del-past',
        ...base,
      });
      await webhookRepo.create({
        tenantId: tenantB._id,
        deliveryId: 'del-future',
        ...base,
      });

      const now = new Date();
      await webhookRepo.updateStatus(past._id, { nextAttemptAt: new Date(now.getTime() - 1000) });
      const future = await webhookRepo.findByDeliveryId('del-future');
      if (future) {
        await webhookRepo.updateStatus(future._id, {
          nextAttemptAt: new Date(now.getTime() + 60000),
        });
      }

      expect((await webhookRepo.findById(past._id))?._id).toBe(past._id);
      expect((await webhookRepo.findByDeliveryId('del-past'))?._id).toBe(past._id);

      const tenantADeliveries = await webhookRepo.findByTenantId(tenantA._id);
      expect(tenantADeliveries.map((d) => d.deliveryId)).toEqual(['del-past']);

      const due = await webhookRepo.findPendingRetries(now, 10);
      expect(due.map((d) => d.deliveryId)).toEqual(['del-past']);

      const updated = await webhookRepo.updateStatus(past._id, {
        status: 'success',
        statusCode: 200,
      });
      expect(updated?.status).toBe('success');
    });
  });

  describe('MongoAuthRepository', () => {
    it('round-trips credentials and signal keys', async () => {
      const tenantA = await tenantRepo.create({ name: 'T A', slug: 'ta' });
      const tenantB = await tenantRepo.create({ name: 'T B', slug: 'tb' });

      const creds = { keys: { some: 'value' }, registered: true };
      await authRepo.saveCreds(tenantA._id, 'inst_aa', creds);
      const found = await authRepo.findCreds(tenantA._id, 'inst_aa');
      expect(found?.creds).toEqual(creds);

      const crossTenant = await authRepo.findCreds(tenantB._id, 'inst_aa');
      expect(crossTenant).toBeNull();

      await authRepo.setKeys(tenantA._id, 'inst_aa', 'pre-key', {
        '1': { id: 1, value: 'one' },
        '2': { id: 2, value: 'two' },
      });
      const keys = await authRepo.findKeys(tenantA._id, 'inst_aa', 'pre-key');
      expect(keys.length).toBe(2);

      const crossTenantKeys = await authRepo.findKeys(tenantB._id, 'inst_aa', 'pre-key');
      expect(crossTenantKeys.length).toBe(0);

      expect(await authRepo.deleteKey(tenantA._id, 'inst_aa', '1')).toBe(true);
      expect((await authRepo.findKeys(tenantA._id, 'inst_aa', 'pre-key')).length).toBe(1);

      expect(await authRepo.deleteCreds(tenantA._id, 'inst_aa')).toBe(true);
      expect(await authRepo.findCreds(tenantA._id, 'inst_aa')).toBeNull();
    });
  });
});
