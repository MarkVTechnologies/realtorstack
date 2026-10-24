import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/env.js';

let memoryServer: { stop: () => Promise<boolean> } | null = null;

/**
 * Connects to MONGO_URI, or — in development/test when it is empty — boots an embedded
 * MongoDB (mongodb-memory-server). Dev data is persisted to ./.mongo-data between restarts.
 */
export async function connectDb(opts: { ephemeral?: boolean } = {}) {
  let uri = env.MONGO_URI;
  if (!uri) {
    if (env.isProd) throw new Error('MONGO_URI is required in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const instance: { dbPath?: string; storageEngine?: 'wiredTiger' } = {};
    if (!opts.ephemeral) {
      const dbPath = path.resolve('.mongo-data');
      fs.mkdirSync(dbPath, { recursive: true });
      instance.dbPath = dbPath;
      instance.storageEngine = 'wiredTiger';
    }
    const server = await MongoMemoryServer.create({ instance });
    memoryServer = server;
    uri = server.getUri('realtorstack');
    if (!env.isTest) console.log(`[db] embedded MongoDB at ${uri}${instance.dbPath ? ` (data: ${instance.dbPath})` : ''}`);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
}
