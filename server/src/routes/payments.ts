import { Router } from 'express';
import { Lead, Payment, User } from '../models/index.js';
import { pageParams, qstr } from '../lib/http.js';
import { forbidden } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { can, ctx, isRealtor } from '../middleware/auth.js';

export const paymentsRouter = Router();

/** Payments ledger (§8.13: Owner/Admin/Finance all; realtors own clients). */
paymentsRouter.get('/', async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const f: Record<string, unknown> = { tenantId };
  if (isRealtor(req)) f.realtorId = auth.userId;
  else if (!can(auth.role, 'payments.ledger')) throw forbidden();
  const from = qstr(req.query.from), to = qstr(req.query.to);
  if (from || to) f.paidAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59+01:00`) } : {}) };
  const type = qstr(req.query.type);
  if (type) f.type = type;
  const { page, limit, skip } = pageParams(req);
  const csv = req.query.format === 'csv';
  const items = await Payment.find(f).sort({ paidAt: -1 }).skip(csv ? 0 : skip).limit(csv ? 50000 : limit).lean();
  const [leads, users, total, sum] = await Promise.all([
    Lead.find({ tenantId, _id: { $in: items.map((p) => p.leadId) } }).select('name phone').lean(),
    User.find({ tenantId, _id: { $in: items.map((p) => p.realtorId).filter(Boolean) } }).select('name').lean(),
    Payment.countDocuments(f),
    Payment.aggregate([{ $match: f }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
  ]);
  const hide = isRealtor(req) && !!tenant.settings?.hidePaymentAmountsFromRealtors;
  const rows = items.map((p) => ({
    ...p,
    amount: hide ? null : p.amount,
    lead: leads.find((l) => String(l._id) === String(p.leadId)) ?? null,
    realtor: users.find((u) => String(u._id) === String(p.realtorId))?.name ?? 'House',
  }));
  if (csv) {
    res.type('text/csv').attachment('payments-ledger.csv').send(toCsv(rows.map((r) => ({
      paidAt: r.paidAt, reference: r.reference, type: r.type, amount: r.amount, provider: r.provider, client: r.lead?.name, phone: r.lead?.phone, realtor: r.realtor, note: r.note,
    }))));
    return;
  }
  res.json({ items: rows, total, page, limit, totalAmount: hide ? null : sum[0]?.amount ?? 0 });
});
