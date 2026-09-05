import { Router, type RequestHandler } from 'express';
import { NotFoundError } from '../../../shared/errors/index.js';
import type { HttpDependencies } from '../types/index.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createHealthRouter } from './health.js';
import { createAuthRouter } from './auth.routes.js';
import { createInstanceRouter } from './instance.routes.js';
import { createMessageRouter } from './message.routes.js';
import { createAuditRouter } from './audit.routes.js';
import { createMetricsRouter } from './metrics.routes.js';

/**
 * Aggregates every sub-router under the `/api/v1` prefix and attaches the 404
 * handler plus the central error handler. Returns a fully configured router
 * ready to be mounted by the application.
 */
export function createApiRouter(deps: HttpDependencies): Router {
  const router = Router();

  const healthRouter = createHealthRouter(deps);
  const authRouter = createAuthRouter(deps);
  const instanceRouter = createInstanceRouter(deps);
  const messageRouter = createMessageRouter(deps);
  const auditRouter = createAuditRouter(deps);
  const metricsRouter = createMetricsRouter(deps);

  router.use('/api/v1', authRouter);
  router.use('/api/v1', instanceRouter);
  router.use('/api/v1', messageRouter);
  router.use('/api/v1', auditRouter);
  router.use('/api/v1', metricsRouter);

  router.use(healthRouter);

  const notFound: RequestHandler = (_req, res, next) => {
    next(new NotFoundError('Route'));
  };
  router.use(notFound);

  router.use(errorHandler(deps.logger));

  return router;
}
