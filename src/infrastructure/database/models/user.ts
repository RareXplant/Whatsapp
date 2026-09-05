import { Schema, model, SchemaTypes } from 'mongoose';
import type { UserRole } from '../../../domain/entities/user.js';

export const USER_ROLES: UserRole[] = ['owner', 'admin', 'operator', 'viewer'];

export interface UserDocument {
  tenantId: Schema.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    tenantId: { type: SchemaTypes.ObjectId, ref: 'Tenant', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, default: 'operator' },
  },
  {
    collection: 'users',
    timestamps: true,
  },
);

userSchema.set('strict', true);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const UserModel = model<UserDocument>('User', userSchema);
