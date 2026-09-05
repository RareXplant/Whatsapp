import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import hpp from 'hpp';
import { config } from '../../config.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { HttpDependencies } from './types/index.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { createApiRouter } from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../../../public');

function corsOrigins(): string[] {
  return config.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Builds and configures the Express application. All infrastructure and service
 * dependencies are injected so the application is easy to unit test.
 */
export function createApp(deps: HttpDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
    }),
  );
  app.use(hpp());
  app.use(compression());
  app.use(express.json({ limit: config.MAX_REQUEST_BODY_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: config.MAX_REQUEST_BODY_SIZE }));

  app.use(requestIdMiddleware());
  app.use(rateLimitMiddleware());

  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.use(createApiRouter(deps));

  const notFound: RequestHandler = (_req, _res, next) => {
    next(new NotFoundError('Route'));
  };
  app.use(notFound);
  app.use(errorHandler(deps.logger));

  return app;
}
