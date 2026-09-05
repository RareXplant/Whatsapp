import bcrypt from 'bcryptjs';
import type { User, UserRole } from '../../src/domain/entities/index.js';
import { InMemoryTenantRepository, InMemoryUserRepository } from '../mocks/repositories.js';

export interface SeededTenant {
  tenantId: string;
  userId: string;
  email: string;
  password: string;
  user: User;
}

/**
 * Seeds a tenant + owner user into the given repositories and returns the
 * credentials. The owner user's password is bcrypt-hashed like the real
 * registration path.
 */
export async function seedTenantAndOwner(
  tenantRepository: InMemoryTenantRepository,
  userRepository: InMemoryUserRepository,
  options: { email?: string; password?: string; role?: UserRole } = {},
): Promise<SeededTenant> {
  const password = options.password ?? 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 4);

  const tenant = await tenantRepository.create({
    name: 'Seeded Tenant',
    slug: `seeded-${Date.now().toString(36)}`,
  });

  const user = await userRepository.create({
    tenantId: tenant._id,
    email: options.email ?? `owner-${Date.now().toString(36)}@example.com`,
    passwordHash,
    name: 'Seeded Owner',
    role: options.role ?? 'owner',
  });

  return {
    tenantId: tenant._id,
    userId: user._id,
    email: user.email,
    password,
    user,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 4);
}
