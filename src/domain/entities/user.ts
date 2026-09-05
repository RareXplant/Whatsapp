export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface User {
  _id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
