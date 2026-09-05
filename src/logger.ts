import pino from 'pino';
import { config } from './config.js';

const transport =
  config.NODE_ENV === 'production'
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      });

export const logger = pino(
  {
    level: config.LOG_LEVEL,
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    redact: {
      paths: [
        'password',
        'apiKey',
        'api_key',
        'secret',
        'token',
        'jwt',
        'jwt_secret',
        'webhookSecret',
        'webhook_secret',
        'authState',
        'auth_state',
        'creds',
        'signalKeys',
        'signal_keys',
        'encryption_key',
      ],
      censor: '[REDACTED]',
    },
  },
  transport,
);

export type Logger = pino.Logger;
