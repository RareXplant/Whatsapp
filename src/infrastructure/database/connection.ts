import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

let memoryMongoServer: MongoMemoryServer | null = null;

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
    const error = err instanceof Error ? err : new Error(String(err));
    const isConnectionError = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|querySrv/i.test(error.message);

    if (config.NODE_ENV === 'production' || !isConnectionError) {
      throw err;
    }

    logger.warn(
      {
        dbName: config.MONGODB_DB_NAME,
        host: toSafeUri(config.MONGODB_URI),
        error: error.message,
      },
      'mongodb unavailable, starting in-memory fallback database',
    );

    memoryMongoServer = await MongoMemoryServer.create({
      instance: { dbName: config.MONGODB_DB_NAME },
    });

    await mongoose.connect(memoryMongoServer.getUri(config.MONGODB_DB_NAME), {
      dbName: config.MONGODB_DB_NAME,
      autoCreate: true,
      serverSelectionTimeoutMS: 15_000,
    });
  }

  logger.info({ dbName: config.MONGODB_DB_NAME }, 'mongodb connected');
}

export async function disconnectFromMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (memoryMongoServer) {
    await memoryMongoServer.stop();
    memoryMongoServer = null;
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
