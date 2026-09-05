import { describe, expect, it } from 'vitest';
import { proto } from '@whiskeysockets/baileys';
import { useMongoAuthState } from '../../../../../src/infrastructure/baileys/auth/useMongoAuthState.js';
import { InMemoryAuthRepository } from '../../../../../tests/mocks/repositories.js';

const TENANT = 'tenant_1';
const INSTANCE = 'inst_1';

describe('useMongoAuthState', () => {
  it('returns initAuthCreds defaults when nothing is stored', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    expect(state.creds).toBeDefined();
    expect(typeof state.creds.registrationId).toBe('number');
    expect(state.creds.noiseKey).toBeDefined();
    expect(state.keys).toBeDefined();
    expect(typeof state.keys.get).toBe('function');
    expect(typeof state.keys.set).toBe('function');
    expect(typeof state.keys.clear).toBe('function');
    expect(repository.creds.size).toBe(0);
  });

  it('persists creds via saveCreds and reloads them into a fresh state', async () => {
    const repository = new InMemoryAuthRepository();
    const first = await useMongoAuthState(TENANT, INSTANCE, repository);
    first.state.creds.platform = 'android';
    await first.saveCreds();

    expect(repository.creds.size).toBe(1);

    const second = await useMongoAuthState(TENANT, INSTANCE, repository);
    expect(second.state.creds.registrationId).toBe(first.state.creds.registrationId);
    expect(second.state.creds.platform).toBe('android');
  });

  it('reads back creds previously stored in the repository', async () => {
    const repository = new InMemoryAuthRepository();
    const first = await useMongoAuthState(TENANT, INSTANCE, repository);
    await first.saveCreds();

    const stored = await repository.findCreds(TENANT, INSTANCE);
    expect(stored).not.toBeNull();
    expect(stored?.creds).toHaveProperty('registrationId');
  });

  it('stores compound key ids for supported categories', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    await state.keys.set({
      'pre-key': {
        '1': {
          private: Buffer.from('priv'),
          public: Buffer.from('pub'),
        },
      },
    });

    const stored = await repository.findKeys(TENANT, INSTANCE, 'pre-key');
    expect(stored).toHaveLength(1);
    expect(stored[0].keyId).toBe('pre-key|1');
    expect(stored[0].data).toEqual({
      private: { type: 'Buffer', data: Buffer.from('priv').toString('base64') },
      public: { type: 'Buffer', data: Buffer.from('pub').toString('base64') },
    });
  });

  it('returns stored values for supported categories with buffers restored', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    await state.keys.set({
      'pre-key': {
        '1': {
          private: Buffer.from('priv'),
          public: Buffer.from('pub'),
        },
      },
    });

    const got = await state.keys.get('pre-key', ['1', '7']);
    expect(Object.keys(got)).toContain('1');
    expect(Object.keys(got)).not.toContain('7');
    const preKey = got['1']!;
    expect(Buffer.isBuffer(preKey.private)).toBe(true);
    expect((preKey.private as Buffer).equals(Buffer.from('priv'))).toBe(true);
    expect(Buffer.isBuffer(preKey.public)).toBe(true);
  });

  it('skips unsupported categories on set and get', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    await state.keys.set({ 'lid-mapping': { abc: {} } } as never);
    expect(repository.keys.size).toBe(0);

    const got = await state.keys.get('lid-mapping', ['abc']);
    expect(Object.keys(got)).toHaveLength(0);
  });

  it('converts app-state-sync-key values via proto.Message.AppStateSyncKeyData.fromObject', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    const raw = {
      keyData: Buffer.from('app-state-key-bytes'),
      fingerprint: { rawId: 1, currentIndex: 2, deviceIndexes: [3, 4] },
      timestamp: 1700000000,
    };
    await state.keys.set({
      'app-state-sync-key': {
        syncHash123: raw as unknown as proto.Message.AppStateSyncKeyData,
      },
    });

    const stored = await repository.findKeys(TENANT, INSTANCE, 'app-state-sync-key');
    expect(stored).toHaveLength(1);
    expect(stored[0].keyId).toBe('app-state-sync-key|syncHash123');

    const got = await state.keys.get('app-state-sync-key', ['syncHash123']);
    expect(Object.keys(got)).toContain('syncHash123');
    const value = got['syncHash123'] as unknown as {
      keyData?: unknown;
      fingerprint?: { rawId?: number; currentIndex?: number; deviceIndexes?: number[] };
      timestamp?: unknown;
    };
    expect(Buffer.isBuffer(value.keyData)).toBe(true);
    expect(value.fingerprint?.rawId).toBe(1);
    expect(value.fingerprint?.currentIndex).toBe(2);
    expect(value.fingerprint?.deviceIndexes).toEqual([3, 4]);
    expect(Number(value.timestamp)).toBe(1700000000);
  });

  it('clear deletes creds and keys and yields an empty state next init', async () => {
    const repository = new InMemoryAuthRepository();
    const { state } = await useMongoAuthState(TENANT, INSTANCE, repository);

    await state.keys.set({
      'pre-key': {
        '1': {
          private: Buffer.from('priv'),
          public: Buffer.from('pub'),
        },
      },
    });
    await state.keys.clear?.();

    expect(repository.creds.size).toBe(0);
    expect(repository.keys.size).toBe(0);

    const fresh = await useMongoAuthState(TENANT, INSTANCE, repository);
    expect(fresh.state.creds).toBeDefined();
    expect(typeof fresh.state.creds.registrationId).toBe('number');
    const got = await fresh.state.keys.get('pre-key', ['1']);
    expect(Object.keys(got)).toHaveLength(0);
  });
});
