import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    env: { NODE_ENV: 'test', MONGO_URI: '', JWT_SECRET: 'test-secret', REVALIDATE_SECRET: '', SMTP_HOST: '' },
  },
});
