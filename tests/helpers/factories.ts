import { Types } from 'mongoose';
import type { ApiKey, Instance, Tenant, User, UserRole } from '../../src/domain/entities/index.js';

let counter = 0;

export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${process.pid.toString(36)}-${counter}`;
}

export function objectId(hex?: string): string {
  return hex ?? new Types.ObjectId().toHexString();
}

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  const suffix = uniqueSuffix();
  return {
    _id: objectId(),
    name: `Tenant ${suffix}`,
    slug: `tenant-${suffix}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  const suffix = uniqueSuffix();
  return {
    _id: objectId(),
    tenantId: objectId(),
    email: `user-${suffix}@example.com`,
    passwordHash: 'not-a-real-hash',
    name: `User ${suffix}`,
    role: 'operator',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeInstance(overrides: Partial<Instance> = {}): Instance {
  const suffix = uniqueSuffix();
  return {
    _id: objectId(),
    tenantId: objectId(),
    instanceId: `inst_${suffix}`,
    name: `Instance ${suffix}`,
    status: 'created',
    phoneNumber: null,
    pushName: null,
    profilePictureUrl: null,
    platform: null,
    connectionState: null,
    lastQr: null,
    pairingCode: null,
    pairingPhoneNumber: null,
    webhookUrl: null,
    webhookSecret: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastErrorAt: null,
    reconnectAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  const suffix = uniqueSuffix();
  return {
    _id: objectId(),
    tenantId: objectId(),
    userId: objectId(),
    name: `key-${suffix}`,
    keyHash: `hash-${suffix}`,
    keyPrefix: 'wag',
    scopes: ['instances.read', 'messages.send'],
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export const ROLES: UserRole[] = ['owner', 'admin', 'operator', 'viewer'];
