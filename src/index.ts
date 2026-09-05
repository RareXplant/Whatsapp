import { config } from './config.js';
import { logger } from './logger.js';
import { createApplication, shutdownApplication, type ApplicationContext } from './app.js';

async function main(): Promise<void> {
  logger.info(
    { version: process.env.npm_package_version ?? '1.0.0' },
    'starting whatsapp-multi-gateway',
  );

  let context: ApplicationContext;
  try {
    context = await createApplication();
  } catch (err) {
    logger.error({ err }, 'failed to initialize application');
    process.exit(1);
  }

  await context.startupService.startup();

  const startServer = (port: number): void => {
    context.server.listen(port, config.HOST, () => {
      logger.info({ host: config.HOST, port }, 'http server listening');
    });
  };

  context.server.on('error', (err: Error & { code?: string; port?: number }) => {
    if (err.code === 'EADDRINUSE' && typeof err.port === 'number') {
      const fallbackPort = err.port + 1;
      logger.warn({ port: err.port, fallbackPort }, 'port in use, retrying on next available port');
      startServer(fallbackPort);
      return;
    }

    logger.error({ err }, 'http server error');
  });

  startServer(config.PORT);

  let shuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'received shutdown signal');

    const forceTimer = setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 15_000);
    forceTimer.unref();

    try {
      const closeServer = new Promise<void>((resolve) => {
        context.server.close(() => resolve());
        context.server.closeAllConnections?.();
      });
      await closeServer;

      await shutdownApplication(context);
      logger.info('application stopped cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error({ err }, 'uncaught exception');
  });
}

void main();
