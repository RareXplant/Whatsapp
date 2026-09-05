import { Router } from 'express';
import { metricsMiddleware } from '../../../infrastructure/metrics/metrics.js';
import type { HttpDependencies } from '../types/index.js';

/**
 * Exposes Prometheus metrics at `/metrics`.
 */
export function createMetricsRouter(_deps: HttpDependencies): Router {
  const router = Router();
  router.get('/metrics', metricsMiddleware);
  return router;
}
