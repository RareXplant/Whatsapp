export { createApp } from './app.js';
export { createApiRouter } from './routes/index.js';
export { authenticate, requirePermission } from './middleware/auth.js';
export { errorHandler } from './middleware/error-handler.js';
export { requestIdMiddleware } from './middleware/request-id.js';
export { rateLimitMiddleware, strictRateLimitMiddleware } from './middleware/rate-limit.js';
export type { HttpDependencies } from './types/index.js';
export type {
  AuthService,
  InstanceService,
  MessageService,
  AuditService,
} from '../../application/services/index.js';
export type * from '../../application/dto/index.js';
export * from './schemas/index.js';
