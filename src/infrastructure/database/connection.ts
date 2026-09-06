import mongoose from 'mongoose';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

export interface MongoHealth {
  status: 'connected' | 'disconnected' | 'connecting' | 'disconnecting' | 'uninitialized';
  readyState: number;
  connected: boolean;
}

function mapReadyState(readyState: number): MongoHealth['status'] {
  switch (readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 99:
      return 'uninitialized';
    default:
      return 'disconnected';
  }
}

function toSafeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username) {
      const redactedUser = parsed.username
        ? `${parsed.username}${parsed.password ? ':****' : ''}`
        : '';
      parsed.username = redactedUser;
      parsed.password = '';
    }
    return parsed.toString();
  } catch {
    return '(invalid uri)';
  }
}

export async function connectToMongo(): Promise<void> {
  mongoose.set('bufferCommands', false);

  logger.info(
    {
      dbName: config.MONGODB_DB_NAME,
      host: toSafeUri(config.MONGODB_URI),
    },
    'connecting to mongodb',
  );

  try {
    await mongoose.connect(config.MONGODB_URI, {
      dbName: config.MONGODB_DB_NAME,
      autoCreate: true,
      serverSelectionTimeoutMS: 15_000,
    });
  } catch (err) {
    logger.error(
      {
        dbName: config.MONGODB_DB_NAME,
        host: toSafeUri(config.MONGODB_URI),
        error: err instanceof Error ? err.message : String(err),
      },
      'mongodb connection failed — refusing to start with a fallback database',
    );
    throw err;
  }

  logger.info({ dbName: config.MONGODB_DB_NAME }, 'mongodb connected');
}

export async function disconnectFromMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  logger.info({}, 'mongodb disconnected');
}

export function checkMongoHealth(): MongoHealth {
  const readyState = mongoose.connection.readyState;
  return {
    status: mapReadyState(readyState),
    readyState,
    connected: readyState === 1,
  };
}
