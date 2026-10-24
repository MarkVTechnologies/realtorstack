import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requireAuth, requireSuperAdmin, requireTenant } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { UPLOAD_DIR } from './services/storage.js';
import { authRouter } from './routes/auth.js';
import { firmRouter } from './routes/firm.js';
import { estatesRouter } from './routes/estates.js';
import { realtorsRouter } from './routes/realtors.js';
import { leadsRouter } from './routes/leads.js';
import { bookingsRouter } from './routes/bookings.js';
import { conflictsRouter } from './routes/conflicts.js';
import { commissionsRouter } from './routes/commissions.js';
import { paymentsRouter } from './routes/payments.js';
import { analyticsRouter } from './routes/analytics.js';
import { auditRouter, notificationsRouter, uploadsRouter } from './routes/misc.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: [env.CLIENT_URL], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  // navigator.sendBeacon posts text/plain
  app.use('/api/public/touch', express.text({ type: 'text/plain', limit: '8kb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use('/media', express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true, fallthrough: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  const api = Router();
  api.use(rateLimit({ windowMs: 60_000, limit: env.isProd ? 300 : 10_000, standardHeaders: 'draft-8', legacyHeaders: false }));
  api.use('/public', publicRouter);
  api.use('/auth', authRouter);

  const firm = Router();
  firm.use(requireAuth, requireTenant);
  firm.use('/firm', firmRouter);
  firm.use('/estates', estatesRouter);
  firm.use('/realtors', realtorsRouter);
  firm.use('/leads', leadsRouter);
  firm.use('/bookings', bookingsRouter);
  firm.use('/conflicts', conflictsRouter);
  firm.use('/commissions', commissionsRouter);
  firm.use('/payments', paymentsRouter);
  firm.use('/analytics', analyticsRouter);
  firm.use('/audit', auditRouter);
  firm.use('/uploads', uploadsRouter);

  api.use('/notifications', requireAuth, notificationsRouter);
  api.use('/admin', requireAuth, requireSuperAdmin, adminRouter);
  api.use(firm);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
