import { Router, type RequestHandler } from 'express';
import process from 'node:process';
import { checkMongoHealth } from '../../../infrastructure/database/connection.js';
import { createSuccessResponse } from '../../../shared/utils/index.js';
import type { HttpDependencies } from '../types/index.js';

/**
 * Basic liveness probe. Never throws.
 */
export function createHealthRouter(_deps: HttpDependencies): Router {
  const router = Router();

  const health: RequestHandler = (_req, res) => {
    res.status(200).json(
      createSuccessResponse(
        {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
        _req.requestId,
      ),
    );
  };

  const ready: RequestHandler = (_req, res) => {
    const mongo = checkMongoHealth();
    if (mongo.connected) {
      res
        .status(200)
        .json(createSuccessResponse({ status: 'ok', database: 'connected' }, _req.requestId));
      return;
    }
    res
      .status(503)
      .json(
        createSuccessResponse(
          { status: 'error', database: mongo.status, ready: false },
          _req.requestId,
        ),
      );
  };

  router.get('/health', health);
  router.get('/ready', ready);

  return router;
}
