import type {
  ApiKeyRepository,
  AuditLogRepository,
  AuthRepository,
  CreateApiKeyInput,
  CreateAuditLogInput,
  CreateInstanceInput,
  CreateMessageInput,
  CreateTenantInput,
  CreateUserInput,
  CreateWebhookDeliveryInput,
  InstanceRepository,
  MessageRepository,
  TenantRepository,
  UpdateInstanceInput,
  UpdateTenantInput,
  UpdateUserInput,
  UpdateWebhookDeliveryInput,
  UserRepository,
  WebhookDeliveryRepository,
} from '../../src/domain/ports/index.js';
import type {
  ApiKey,
  AuditLog,
  AuthCredential,
  AuthKey,
  AuthKeyCategory,
  Instance,
  Message,
  Tenant,
  User,
  WebhookDelivery,
} from '../../src/domain/entities/index.js';

function fresh(): <T>(value: T) => T {
  return <T>(value: T) => value;
}

export class InMemoryTenantRepository implements TenantRepository {
  items = new Map<string, Tenant>();

  constructor(seed: Tenant[] = []) {
    for (const t of seed) this.items.set(t._id, fresh()(t));
  }

  async findById(id: string): Promise<Tenant | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    for (const t of this.items.values()) {
      if (t.slug === slug) return fresh()(t);
    }
    return null;
  }

  async create(input: CreateTenantInput): Promise<Tenant> {
    const now = new Date();
    const tenant: Tenant = {
      _id: `tenant_${this.items.size + 1}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(tenant._id, tenant);
    return fresh()(tenant);
  }

  async update(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }
}

export class InMemoryUserRepository implements UserRepository {
  items = new Map<string, User>();

  constructor(seed: User[] = []) {
    for (const u of seed) this.items.set(u._id, fresh()(u));
  }

  async findById(id: string): Promise<User | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    for (const u of this.items.values()) {
      if (u.tenantId === tenantId && u.email === email) return fresh()(u);
    }
    return null;
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    for (const u of this.items.values()) {
      if (u.email === email) return fresh()(u);
    }
    return null;
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    return fresh()([...this.items.values()].filter((u) => u.tenantId === tenantId));
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      _id: `user_${this.items.size + 1}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(user._id, user);
    return fresh()(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  items = new Map<string, ApiKey>();

  constructor(seed: ApiKey[] = []) {
    for (const k of seed) this.items.set(k._id, fresh()(k));
  }

  async findById(id: string): Promise<ApiKey | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    for (const k of this.items.values()) {
      if (k.keyHash === keyHash) return fresh()(k);
    }
    return null;
  }

  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    return fresh()([...this.items.values()].filter((k) => k.tenantId === tenantId));
  }

  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    const key: ApiKey = {
      _id: `apikey_${this.items.size + 1}`,
      ...input,
      lastUsedAt: null,
      createdAt: new Date(),
    };
    this.items.set(key._id, key);
    return fresh()(key);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async updateLastUsed(id: string, lastUsedAt: Date): Promise<ApiKey | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, lastUsedAt };
    this.items.set(id, updated);
    return fresh()(updated);
  }
}

export class InMemoryInstanceRepository implements InstanceRepository {
  items = new Map<string, Instance>();

  constructor(seed: Instance[] = []) {
    for (const i of seed) this.items.set(i._id, fresh()(i));
  }

  async findById(id: string): Promise<Instance | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findByInstanceId(instanceId: string): Promise<Instance | null> {
    for (const i of this.items.values()) {
      if (i.instanceId === instanceId) return fresh()(i);
    }
    return null;
  }

  async findByTenantId(tenantId: string): Promise<Instance[]> {
    return fresh()([...this.items.values()].filter((i) => i.tenantId === tenantId));
  }

  async findAll(): Promise<Instance[]> {
    return fresh()([...this.items.values()]);
  }

  async create(input: CreateInstanceInput): Promise<Instance> {
    const now = new Date();
    const instance: Instance = {
      _id: `instance_${this.items.size + 1}`,
      ...input,
      name: input.name,
      status: input.status,
      phoneNumber: input.phoneNumber ?? null,
      pushName: input.pushName ?? null,
      profilePictureUrl: input.profilePictureUrl ?? null,
      platform: input.platform ?? null,
      connectionState: input.connectionState ?? null,
      lastQr: input.lastQr ?? null,
      pairingCode: input.pairingCode ?? null,
      pairingPhoneNumber: input.pairingPhoneNumber ?? null,
      webhookUrl: input.webhookUrl ?? null,
      webhookSecret: input.webhookSecret ?? null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastErrorAt: null,
      reconnectAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(instance._id, instance);
    return fresh()(instance);
  }

  async update(id: string, input: UpdateInstanceInput): Promise<Instance | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }

  async updateStatus(id: string, status: Instance['status']): Promise<Instance | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return [...this.items.values()].filter((i) => i.tenantId === tenantId).length;
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  items = new Map<string, Message>();

  constructor(seed: Message[] = []) {
    for (const m of seed) this.items.set(m._id, fresh()(m));
  }

  async findById(id: string): Promise<Message | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findByInstanceAndRemoteJid(instanceId: string, remoteJid: string): Promise<Message[]> {
    return fresh()(
      [...this.items.values()].filter(
        (m) => m.instanceId === instanceId && m.remoteJid === remoteJid,
      ),
    );
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const message: Message = {
      _id: `message_${this.items.size + 1}`,
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.set(message._id, message);
    return fresh()(message);
  }

  async updateStatus(id: string, status: Message['status']): Promise<Message | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, status, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }

  async findByTenantId(tenantId: string): Promise<Message[]> {
    return fresh()([...this.items.values()].filter((m) => m.tenantId === tenantId));
  }

  async findDuplicate(
    tenantId: string,
    instanceId: string,
    messageId: string,
  ): Promise<Message | null> {
    for (const m of this.items.values()) {
      if (m.tenantId === tenantId && m.instanceId === instanceId && m.messageId === messageId) {
        return fresh()(m);
      }
    }
    return null;
  }
}

export class InMemoryWebhookDeliveryRepository implements WebhookDeliveryRepository {
  items = new Map<string, WebhookDelivery>();

  constructor(seed: WebhookDelivery[] = []) {
    for (const d of seed) this.items.set(d._id, fresh()(d));
  }

  async findById(id: string): Promise<WebhookDelivery | null> {
    return fresh()(this.items.get(id) ?? null);
  }

  async findByDeliveryId(deliveryId: string): Promise<WebhookDelivery | null> {
    for (const d of this.items.values()) {
      if (d.deliveryId === deliveryId) return fresh()(d);
    }
    return null;
  }

  async findByTenantId(tenantId: string): Promise<WebhookDelivery[]> {
    return fresh()([...this.items.values()].filter((d) => d.tenantId === tenantId));
  }

  async create(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      _id: `delivery_${this.items.size + 1}`,
      ...input,
      attempts: input.attempts ?? 0,
      statusCode: null,
      response: null,
      lastAttemptAt: null,
      nextAttemptAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.set(delivery._id, delivery);
    return fresh()(delivery);
  }

  async updateStatus(
    id: string,
    input: UpdateWebhookDeliveryInput,
  ): Promise<WebhookDelivery | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return fresh()(updated);
  }

  async findPendingRetries(now: Date, limit: number): Promise<WebhookDelivery[]> {
    return fresh()(
      [...this.items.values()]
        .filter((d) => d.status === 'pending' && d.nextAttemptAt !== null && d.nextAttemptAt <= now)
        .slice(0, limit),
    );
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  items = new Map<string, AuditLog>();

  constructor(seed: AuditLog[] = []) {
    for (const l of seed) this.items.set(l._id, fresh()(l));
  }

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const log: AuditLog = {
      _id: `audit_${this.items.size + 1}`,
      ...input,
      timestamp: new Date(),
      createdAt: new Date(),
    };
    this.items.set(log._id, log);
    return fresh()(log);
  }

  async findByTenantId(tenantId: string): Promise<AuditLog[]> {
    return fresh()([...this.items.values()].filter((l) => l.tenantId === tenantId));
  }

  async findByInstanceId(instanceId: string): Promise<AuditLog[]> {
    return fresh()([...this.items.values()].filter((l) => l.resourceId === instanceId));
  }
}

export class InMemoryAuthRepository implements AuthRepository {
  creds = new Map<string, AuthCredential>();
  keys = new Map<string, AuthKey>();

  constructor(seed: AuthCredential[] = []) {
    for (const doc of seed) {
      this.creds.set(`${doc.tenantId}|${doc.instanceId}`, doc);
    }
  }

  async findCreds(tenantId: string, instanceId: string) {
    const record = this.creds.get(`${tenantId}|${instanceId}`);
    return fresh()(record ?? null);
  }

  async saveCreds(tenantId: string, instanceId: string, creds: Record<string, unknown>) {
    const id = `${tenantId}|${instanceId}`;
    const now = new Date();
    const record: AuthCredential = {
      _id: `authrec_${id}`,
      tenantId,
      instanceId,
      creds,
      createdAt: now,
      updatedAt: now,
    };
    this.creds.set(id, record);
    return fresh()(record);
  }

  async deleteCreds(tenantId: string, instanceId: string): Promise<boolean> {
    const deleted = this.creds.delete(`${tenantId}|${instanceId}`);
    this.deleteKeysFor(tenantId, instanceId);
    return deleted;
  }

  async findKeys(
    tenantId: string,
    instanceId: string,
    category: AuthKeyCategory,
  ): Promise<AuthKey[]> {
    return fresh()(
      [...this.keys.values()].filter(
        (k) => k.tenantId === tenantId && k.instanceId === instanceId && k.category === category,
      ),
    );
  }

  async setKeys(
    tenantId: string,
    instanceId: string,
    category: AuthKeyCategory,
    entries: Record<string, Record<string, unknown>>,
  ): Promise<AuthKey[]> {
    const created: AuthKey[] = [];
    for (const [keyId, data] of Object.entries(entries)) {
      const now = new Date();
      const record: AuthKey = {
        _id: `authkey_${tenantId}_${instanceId}_${category}_${keyId}`,
        tenantId,
        instanceId,
        category,
        keyId,
        data,
        createdAt: now,
        updatedAt: now,
      };
      this.keys.set(record._id, record);
      created.push(fresh()(record));
    }
    return created;
  }

  async deleteKey(tenantId: string, instanceId: string, keyId: string): Promise<boolean> {
    for (const [id, k] of this.keys) {
      if (k.tenantId === tenantId && k.instanceId === instanceId && k.keyId === keyId) {
        return this.keys.delete(id);
      }
    }
    return false;
  }

  private deleteKeysFor(tenantId: string, instanceId: string): void {
    for (const [id, k] of this.keys) {
      if (k.tenantId === tenantId && k.instanceId === instanceId) {
        this.keys.delete(id);
      }
    }
  }
}
