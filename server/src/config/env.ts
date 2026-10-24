import 'dotenv/config';

function bool(v: string | undefined, d = false) {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes'].includes(v.toLowerCase());
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const CLIENT_URL = (process.env.CLIENT_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const env = {
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT: Number(process.env.PORT ?? 4000),
  MONGO_URI: process.env.MONGO_URI ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-insecure-secret',
  FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY ?? '',
  CLIENT_URL,
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET ?? '',
  ROOT_DOMAIN: process.env.ROOT_DOMAIN ?? '',
  SHORT_LINK_BASE: (process.env.SHORT_LINK_BASE || `${CLIENT_URL}/l`).replace(/\/$/, ''),
  REDIS_URL: process.env.REDIS_URL ?? '',
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  MAIL_FROM: process.env.MAIL_FROM ?? 'RealtorStack <no-reply@realtorstack.com>',
  STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? 'local',
  MEDIA_BASE_URL: (process.env.MEDIA_BASE_URL ?? '').replace(/\/$/, ''),
  SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL ?? 'ops@markv.ng',
  SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD ?? 'ChangeMe123!',
  // In development the OTP is echoed in the API response so the flow can be tested without SMS.
  EXPOSE_DEV_OTP: bool(process.env.EXPOSE_DEV_OTP, NODE_ENV !== 'production'),
};

if (env.isProd) {
  for (const key of ['MONGO_URI', 'JWT_SECRET', 'FIELD_ENCRYPTION_KEY', 'REVALIDATE_SECRET'] as const) {
    if (!env[key]) throw new Error(`Missing required env var ${key}`);
  }
}
