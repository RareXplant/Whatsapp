import type { UserRole } from '../../../domain/entities/index.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      tenantId: string;
      userId: string;
      apiKeyId: string | null;
      role: UserRole;
      userEmail: string;
    }
  }
}

export {};
