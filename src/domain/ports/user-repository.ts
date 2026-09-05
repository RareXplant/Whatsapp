import type { User, UserRole } from '../entities/index.js';

export interface CreateUserInput {
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
}

export type UpdateUserInput = Partial<Pick<User, 'email' | 'passwordHash' | 'name' | 'role'>>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  /**
   * Looks up a user by their globally-unique email address, used only for
   * login (credentials are not scoped to a tenant).
   */
  findByEmailGlobal(email: string): Promise<User | null>;
  findByTenantId(tenantId: string): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
  deleteById(id: string): Promise<boolean>;
}
