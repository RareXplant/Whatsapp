import type { Model } from 'mongoose';
import type { Tenant } from '../../../domain/entities/tenant.js';
import type {
  CreateTenantInput,
  TenantRepository,
  UpdateTenantInput,
} from '../../../domain/ports/tenant-repository.js';
import type { TenantDocument } from '../models/tenant.js';

interface TenantDocWithId extends TenantDocument {
  _id: unknown;
}

function toTenant(doc: TenantDocWithId): Tenant {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoTenantRepository implements TenantRepository {
  constructor(private readonly tenantModel: Model<TenantDocument>) {}

  async findById(id: string): Promise<Tenant | null> {
    const doc = await this.tenantModel.findById(id).lean().exec();
    return doc === null ? null : toTenant(doc);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const doc = await this.tenantModel.findOne({ slug }).lean().exec();
    return doc === null ? null : toTenant(doc);
  }

  async create(input: CreateTenantInput): Promise<Tenant> {
    const doc = await this.tenantModel.create(input);
    return toTenant(doc);
  }

  async update(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
    const doc = await this.tenantModel.findByIdAndUpdate(id, input, { new: true }).lean().exec();
    return doc === null ? null : toTenant(doc);
  }
}
