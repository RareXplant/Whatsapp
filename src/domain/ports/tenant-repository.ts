import type { Tenant } from '../entities/index.js';

export interface CreateTenantInput {
  name: string;
  slug: string;
}

export type UpdateTenantInput = Partial<Pick<Tenant, 'name' | 'slug'>>;

export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  create(input: CreateTenantInput): Promise<Tenant>;
  update(id: string, input: UpdateTenantInput): Promise<Tenant | null>;
}
