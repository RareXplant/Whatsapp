import { Types, type Model } from 'mongoose';
import type { User } from '../../../domain/entities/user.js';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRepository,
} from '../../../domain/ports/user-repository.js';
import type { UserDocument } from '../models/user.js';

interface UserDocWithId extends UserDocument {
  _id: unknown;
}

function toUser(doc: UserDocWithId): User {
  return {
    _id: String(doc._id),
    tenantId: doc.tenantId.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoUserRepository implements UserRepository {
  constructor(private readonly userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<User | null> {
    const doc = await this.userModel.findById(id).lean().exec();
    return doc === null ? null : toUser(doc);
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const doc = await this.userModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), email })
      .lean()
      .exec();
    return doc === null ? null : toUser(doc);
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    const doc = await this.userModel.findOne({ email }).lean().exec();
    return doc === null ? null : toUser(doc);
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    const docs = await this.userModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .lean()
      .exec();
    return docs.map(toUser);
  }

  async create(input: CreateUserInput): Promise<User> {
    const doc = await this.userModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role,
    });
    return toUser(doc);
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const doc = await this.userModel.findByIdAndUpdate(id, input, { new: true }).lean().exec();
    return doc === null ? null : toUser(doc);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.userModel.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }
}
