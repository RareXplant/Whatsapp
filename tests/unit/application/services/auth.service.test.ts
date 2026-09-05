import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../../../src/application/services/auth.service.js';
import { config } from '../../../../src/config.js';
import { hashApiKey } from '../../../../src/shared/crypto/index.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../../src/shared/errors/index.js';
import {
  InMemoryApiKeyRepository,
  InMemoryTenantRepository,
  InMemoryUserRepository,
} from '../../../mocks/repositories.js';
import { seedTenantAndOwner } from '../../../helpers/auth.js';
import { makeApiKey } from '../../../helpers/factories.js';

type Repos = {
  tenantRepository: InMemoryTenantRepository;
  userRepository: InMemoryUserRepository;
  apiKeyRepository: InMemoryApiKeyRepository;
};

function setup(): { service: AuthService } & Repos {
  const tenantRepository = new InMemoryTenantRepository();
  const userRepository = new InMemoryUserRepository();
  const apiKeyRepository = new InMemoryApiKeyRepository();

  const service = new AuthService({
    userRepository,
    apiKeyRepository,
    tenantRepository,
  });

  return { service, tenantRepository, userRepository, apiKeyRepository };
}

async function setupSeeded(): Promise<
  { service: AuthService } & Repos & { seed: Awaited<ReturnType<typeof seedTenantAndOwner>> }
> {
  const repos = setup();
  const seed = await seedTenantAndOwner(repos.tenantRepository, repos.userRepository);
  return { ...repos, seed };
}

describe('AuthService', () => {
  describe('login', () => {
    it('returns a valid JWT token and user on successful login', async () => {
      const { service, seed } = await setupSeeded();

      const result = await service.login(seed.email, seed.password);

      expect(result.user._id).toBe(seed.userId);

      const decoded = jwt.verify(result.token, config.JWT_SECRET) as {
        sub: string;
        tenantId: string;
        role: string;
      };
      expect(decoded.sub).toBe(seed.userId);
      expect(decoded.tenantId).toBe(seed.tenantId);
      expect(decoded.role).toBe('owner');
    });

    it('throws UnauthorizedError for wrong password', async () => {
      const { service, seed } = await setupSeeded();

      await expect(service.login(seed.email, 'DefinitelyWrongPassword!')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError for unknown email', async () => {
      const { service } = setup();
      await expect(service.login('nobody@example.com', 'Whatever123!')).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  describe('verifyToken', () => {
    it('returns user and tenant for a valid token', async () => {
      const { service, seed } = await setupSeeded();

      const { token } = await service.login(seed.email, seed.password);
      const result = await service.verifyToken(token);

      expect(result.user._id).toBe(seed.userId);
      expect(result.tenant._id).toBe(seed.tenantId);
    });

    it('throws UnauthorizedError for a garbage token', async () => {
      const { service } = setup();
      await expect(service.verifyToken('not-a-real-token')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError when the user was deleted', async () => {
      const { service, seed, userRepository } = await setupSeeded();

      const { token } = await service.login(seed.email, seed.password);
      userRepository.items.delete(seed.userId);

      await expect(service.verifyToken(token)).rejects.toThrow('User no longer exists');
    });
  });

  describe('createApiKey', () => {
    it('creates an api key with wag_ prefix and stores the hashed key', async () => {
      const { service, seed } = await setupSeeded();

      const { apiKey, plaintextKey } = await service.createApiKey(
        seed.tenantId,
        seed.userId,
        'my key',
      );

      expect(plaintextKey.startsWith('wag_')).toBe(true);
      expect((apiKey as { tenantId: string }).tenantId).toBe(seed.tenantId);
      expect((apiKey as { keyHash: string }).keyHash).toBe(
        hashApiKey(plaintextKey, config.API_KEY_PEPPER),
      );
    });

    it('throws ForbiddenError when the user belongs to another tenant', async () => {
      const { service, seed } = await setupSeeded();

      await expect(
        service.createApiKey('other-tenant-id', seed.userId, 'key'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws NotFoundError when the user is missing', async () => {
      const { service } = setup();
      await expect(service.createApiKey('tenant-1', 'missing-user', 'key')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('verifyApiKey', () => {
    it('returns the api key and updates lastUsedAt for a valid key', async () => {
      const { service, seed, apiKeyRepository } = await setupSeeded();

      const { apiKey, plaintextKey } = await service.createApiKey(
        seed.tenantId,
        seed.userId,
        'valid key',
      );
      const keyId = (apiKey as { _id: string })._id;

      const result = (await service.verifyApiKey(plaintextKey)) as { keyHash: string };
      expect(result.keyHash).toBe(hashApiKey(plaintextKey, config.API_KEY_PEPPER));
      expect(apiKeyRepository.items.get(keyId)?.lastUsedAt).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedError for an unknown key', async () => {
      const { service } = setup();
      await expect(service.verifyApiKey('wag_unknownkey')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError for an expired key', async () => {
      const { apiKeyRepository, userRepository, tenantRepository } = setup();

      const plaintextKey = 'wag_expired_key';
      const seed = await seedTenantAndOwner(tenantRepository, userRepository);

      await apiKeyRepository.create({
        tenantId: seed.tenantId,
        userId: seed.userId,
        name: 'expired',
        keyHash: hashApiKey(plaintextKey, config.API_KEY_PEPPER),
        keyPrefix: plaintextKey.slice(0, 12),
        scopes: ['*'],
        expiresAt: new Date(Date.now() - 60_000),
      });

      const service = new AuthService({
        userRepository,
        apiKeyRepository,
        tenantRepository,
      });

      await expect(service.verifyApiKey(plaintextKey)).rejects.toThrow('API key has expired');
    });
  });

  describe('deleteApiKey', () => {
    it('removes the key', async () => {
      const apiKeyRepository = new InMemoryApiKeyRepository([
        makeApiKey({ tenantId: 'tenant-1', _id: 'key-1' }),
      ]);
      const service = new AuthService({
        userRepository: new InMemoryUserRepository(),
        apiKeyRepository,
        tenantRepository: new InMemoryTenantRepository(),
      });

      await expect(service.deleteApiKey('tenant-1', 'key-1')).resolves.toBe(true);
      expect(apiKeyRepository.items.has('key-1')).toBe(false);
    });

    it('throws NotFoundError when the key belongs to another tenant', async () => {
      const apiKeyRepository = new InMemoryApiKeyRepository([
        makeApiKey({ tenantId: 'tenant-1', _id: 'key-1' }),
      ]);
      const service = new AuthService({
        userRepository: new InMemoryUserRepository(),
        apiKeyRepository,
        tenantRepository: new InMemoryTenantRepository(),
      });

      await expect(service.deleteApiKey('other-tenant', 'key-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('listApiKeys', () => {
    it('returns only the tenant keys with the DTO shape', async () => {
      const apiKeyRepository = new InMemoryApiKeyRepository([
        makeApiKey({ tenantId: 'tenant-1', _id: 'key-1', name: 'a' }),
        makeApiKey({ tenantId: 'tenant-1', _id: 'key-2', name: 'b' }),
        makeApiKey({ tenantId: 'other-tenant', _id: 'key-3', name: 'c' }),
      ]);
      const service = new AuthService({
        userRepository: new InMemoryUserRepository(),
        apiKeyRepository,
        tenantRepository: new InMemoryTenantRepository(),
      });

      const keys = (await service.listApiKeys('tenant-1')) as Array<{
        _id: string;
        keyHash?: string;
        name: string;
      }>;

      expect(keys.map((k) => k._id).sort()).toEqual(['key-1', 'key-2']);
      expect(keys[0]).not.toHaveProperty('keyHash');
    });
  });
});
