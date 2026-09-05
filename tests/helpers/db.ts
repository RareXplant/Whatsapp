import mongoose from 'mongoose';

/**
 * Connects the shared mongoose instance (used by all Mongo models/repos) to the
 * in-memory MongoDB started by global-setup. Idempotent per connection state.
 */
export async function connectTestDb(): Promise<void> {
  const uri = process.env.VITEST_MONGODB_URI;
  if (!uri) throw new Error('VITEST_MONGODB_URI is not set');

  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }

  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri);
}

export async function disconnectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

/**
 * Drops every collection in the current database. Call between tests to get a
 * clean slate without restarting the server.
 */
export async function clearTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((col) => col.deleteMany({})));
}

export function testDbReady(): boolean {
  return mongoose.connection.readyState === 1;
}
