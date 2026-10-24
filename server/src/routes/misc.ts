import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuditLog, Notification, User } from '../models/index.js';
import { pageParams, parse, qstr } from '../lib/http.js';
import { badRequest } from '../lib/errors.js';
import { ctx, requireCap } from '../middleware/auth.js';
import { storeDocument, storeImage } from '../services/storage.js';

// ---- Audit log viewer -------------------------------------------------------------------------

export const auditRouter = Router();

auditRouter.get('/', requireCap('audit.read'), async (req, res) => {
  const { tenantId } = ctx(req);
  const f: Record<string, unknown> = { tenantId };
  const action = qstr(req.query.action);
  if (action) f.action = new RegExp(`^${action.replace(/[^a-z_.]/gi, '')}`);
  const entityId = qstr(req.query.entityId);
  if (entityId) f.entityId = entityId;
  const { page, limit, skip } = pageParams(req);
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(f)]);
  const actors = await User.find({ _id: { $in: items.map((i) => i.actorId).filter(Boolean) } }).select('name role').lean();
  res.json({ items: items.map((i) => ({ ...i, actor: actors.find((a) => String(a._id) === String(i.actorId)) ?? null })), total, page, limit });
});

// ---- In-app notifications ---------------------------------------------------------------------

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const { auth } = ctx(req);
  const [items, unread] = await Promise.all([
    Notification.find({ userId: auth.userId }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ userId: auth.userId, readAt: null }),
  ]);
  res.json({ items, unread });
});

notificationsRouter.post('/read', async (req, res) => {
  const { auth } = ctx(req);
  const body = parse(z.object({ ids: z.array(z.string()).optional() }), req.body ?? {});
  await Notification.updateMany({ userId: auth.userId, readAt: null, ...(body.ids ? { _id: { $in: body.ids } } : {}) }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

// ---- Uploads (PC-03) --------------------------------------------------------------------------

export const uploadsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

uploadsRouter.post('/image', upload.single('file'), async (req, res) => {
  const { tenantId } = ctx(req);
  if (!req.file) throw badRequest('No file uploaded');
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(req.file.mimetype)) throw badRequest('Upload a JPG, PNG, WebP or AVIF image');
  res.status(201).json(await storeImage(String(tenantId), req.file.buffer));
});

uploadsRouter.post('/document', requireCap('estates.write'), upload.single('file'), async (req, res) => {
  const { tenantId } = ctx(req);
  if (!req.file) throw badRequest('No file uploaded');
  res.status(201).json(await storeDocument(String(tenantId), req.file.buffer, req.file.originalname));
});
