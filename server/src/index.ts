import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { createApp } from './app.js';
import { initQueue } from './services/queue.js';
import { User } from './models/index.js';

async function ensureSuperAdmin() {
  if (await User.exists({ role: 'super_admin' })) return;
  await User.create({
    tenantId: null,
    role: 'super_admin',
    name: 'Mark V Operations',
    email: env.SUPERADMIN_EMAIL.toLowerCase(),
    passwordHash: await bcrypt.hash(env.SUPERADMIN_PASSWORD, 12),
    status: 'active',
  });
  console.log(`[boot] created platform super-admin ${env.SUPERADMIN_EMAIL}`);
}

async function main() {
  await connectDb();
  await initQueue();
  await ensureSuperAdmin();
  if (!env.isProd && process.env.SEED_DEMO !== 'false') {
    const { seedDemo } = await import('./seed.js');
    await seedDemo();
  }
  const app = createApp();
  const server = app.listen(env.PORT, () => console.log(`[api] RealtorStack API listening on http://localhost:${env.PORT}`));

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
