import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { Commission, Estate, Lead, Payment, Product, RealtorProfile, User } from '../models/index.js';
import { pageParams, parse, param, qstr } from '../lib/http.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { formatLagos, formatNaira, monthRange } from '../lib/format.js';
import { can, ctx, isRealtor, requireCap } from '../middleware/auth.js';
import { transitionCommission } from '../services/commission.js';

export const commissionsRouter = Router();

function filterFor(req: Request) {
  const { tenantId, auth } = ctx(req);
  const f: Record<string, unknown> = { tenantId };
  if (isRealtor(req)) f.realtorId = auth.userId;
  else if (!can(auth.role, 'commission.read')) throw forbidden();
  const status = qstr(req.query.status);
  if (status) f.status = status;
  const realtor = qstr(req.query.realtorId);
  if (realtor && !isRealtor(req)) f.realtorId = new Types.ObjectId(realtor);
  const month = qstr(req.query.month);
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month must be YYYY-MM');
    const { start, end } = monthRange(month);
    f.createdAt = { $gte: start, $lt: end };
  }
  return f;
}

async function enrich(tenantId: Types.ObjectId, items: { realtorId: unknown; leadId: unknown; productId?: unknown; estateId?: unknown }[]) {
  const ids = (k: 'realtorId' | 'leadId' | 'productId' | 'estateId') => items.map((i) => i[k]).filter(Boolean) as Types.ObjectId[];
  const [users, profiles, leads, products, estates] = await Promise.all([
    User.find({ tenantId, _id: { $in: ids('realtorId') } }).select('name').lean(),
    RealtorProfile.find({ tenantId, userId: { $in: ids('realtorId') } }).lean(),
    Lead.find({ tenantId, _id: { $in: ids('leadId') } }).select('name phone status').lean(),
    Product.find({ tenantId, _id: { $in: ids('productId') } }).select('name').lean(),
    Estate.find({ tenantId, _id: { $in: ids('estateId') } }).select('name').lean(),
  ]);
  const find = <T extends { _id: unknown }>(arr: T[], id: unknown) => arr.find((x) => String(x._id) === String(id));
  return (i: (typeof items)[number]) => {
    const p = profiles.find((x) => String(x.userId) === String(i.realtorId));
    return {
      realtor: { name: find(users, i.realtorId)?.name, code: p?.code, bank: p?.bank?.accountLast4 ? `${p.bank.bankName} ****${p.bank.accountLast4} (${p.bank.accountName})` : null },
      lead: find(leads, i.leadId) ?? null,
      product: find(products, i.productId)?.name,
      estate: find(estates, i.estateId)?.name,
    };
  };
}

commissionsRouter.get('/', async (req, res) => {
  const { tenantId } = ctx(req);
  const f = filterFor(req);
  const { page, limit, skip } = pageParams(req);
  const [items, total, summary] = await Promise.all([
    Commission.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Commission.countDocuments(f),
    Commission.aggregate([{ $match: { ...f, status: { $ne: 'void' } } }, { $group: { _id: '$status', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
  ]);
  const detail = await enrich(tenantId, items);
  res.json({
    items: items.map((c) => ({ ...c, ...detail(c) })),
    total, page, limit,
    summary: Object.fromEntries(summary.map((s) => [s._id, { amount: s.amount, count: s.n }])),
  });
});

const transition = (to: 'approved' | 'paid' | 'void' | 'earned') => async (req: Request, res: import('express').Response) => {
  const { tenant, auth } = ctx(req);
  const body = parse(z.object({ note: z.string().max(500).optional(), payoutReference: z.string().max(80).optional() }), req.body ?? {});
  if (to === 'paid' && !body.payoutReference) throw badRequest('Enter the transfer / payout reference');
  const c = await transitionCommission({ tenant, commissionId: param(req, 'id'), to, actorId: auth.userId, actorRole: auth.role, ...body });
  res.json(c);
};

commissionsRouter.post('/:id/approve', requireCap('commission.approve'), transition('approved'));
commissionsRouter.post('/:id/pay', requireCap('commission.approve'), transition('paid'));
commissionsRouter.post('/:id/void', requireCap('commission.approve'), transition('void'));
commissionsRouter.post('/:id/earn', requireCap('commission.approve'), transition('earned'));

/** Bulk approve all earned commissions in the current filter. */
commissionsRouter.post('/approve-all', requireCap('commission.approve'), async (req, res) => {
  const { tenant, auth } = ctx(req);
  const items = await Commission.find({ ...filterFor(req), status: 'earned' }).select('_id').limit(500);
  for (const c of items) await transitionCommission({ tenant, commissionId: String(c._id), to: 'approved', actorId: auth.userId, actorRole: auth.role, note: 'Bulk approval' });
  res.json({ approved: items.length });
});

/** AC-06: monthly statement per realtor (PDF / CSV) and firm-wide report (CSV). */
commissionsRouter.get('/statement', async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const month = qstr(req.query.month) ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month must be YYYY-MM');
  const realtorId = isRealtor(req) ? String(auth.userId) : qstr(req.query.realtorId);
  if (!isRealtor(req) && !can(auth.role, 'commission.read')) throw forbidden();
  const { start, end } = monthRange(month);
  const f: Record<string, unknown> = { tenantId, status: { $ne: 'void' }, $or: [{ createdAt: { $gte: start, $lt: end } }, { 'history.at': { $gte: start, $lt: end } }] };
  if (realtorId) f.realtorId = new Types.ObjectId(realtorId);
  const items = await Commission.find(f).sort({ realtorId: 1, createdAt: 1 }).lean();
  const detail = await enrich(tenantId, items);
  const payments = await Payment.find({ tenantId, _id: { $in: items.flatMap((c) => c.paymentIds) } }).select('amount').lean();
  const paidFor = (c: (typeof items)[number]) => payments.filter((p) => c.paymentIds.some((id) => String(id) === String(p._id))).reduce((s, p) => s + p.amount, 0);
  const rows = items.map((c) => {
    const d = detail(c);
    return {
      date: formatLagos(new Date(c.createdAt), { dateStyle: 'medium' }), realtor: d.realtor.name, code: d.realtor.code, client: d.lead?.name || d.lead?.phone,
      estate: d.estate, product: d.product, salePrice: c.salePrice, paidToDate: paidFor(c), rule: c.rule?.type === 'percent' ? `${c.rule.value}%` : formatNaira(c.rule?.value ?? 0),
      commission: c.amount, status: c.status, payoutReference: c.payoutReference ?? '', bank: d.realtor.bank ?? '',
    };
  });
  const format = qstr(req.query.format) ?? 'csv';
  const filename = `commission-${realtorId ? rows[0]?.code ?? 'realtor' : 'firm'}-${month}`;
  if (format === 'csv') {
    res.type('text/csv').attachment(`${filename}.csv`).send(toCsv(rows));
    return;
  }

  const realtor = realtorId ? await User.findOne({ tenantId, _id: realtorId }).select('name phone').lean() : null;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.type('application/pdf').attachment(`${filename}.pdf`);
  doc.pipe(res);
  const brand = tenant.brand?.primaryColor ?? '#0f5132';
  doc.rect(0, 0, doc.page.width, 70).fill(brand);
  doc.fillColor('#ffffff').fontSize(18).text(tenant.name, 40, 22).fontSize(10).text(`Commission statement · ${month}`, 40, 46);
  doc.fillColor('#111827').moveDown(3);
  doc.fontSize(11).text(realtor ? `Realtor: ${realtor.name} (${rows[0]?.code ?? ''})` : 'Firm-wide commission report', 40, 90);
  if (realtor?.phone) doc.text(`Phone: ${realtor.phone}`);
  doc.text(`Generated: ${formatLagos(new Date())} (Africa/Lagos)`);
  doc.moveDown();
  const cols = [
    { k: 'date', w: 70, l: 'Date' }, { k: 'client', w: 95, l: 'Client' }, { k: 'estate', w: 110, l: 'Estate / product' },
    { k: 'salePrice', w: 75, l: 'Sale price' }, { k: 'commission', w: 75, l: 'Commission' }, { k: 'status', w: 60, l: 'Status' },
  ];
  let y = doc.y + 6;
  const drawRow = (vals: string[], bold = false) => {
    let x = 40;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    vals.forEach((v, i) => { doc.text(v, x, y, { width: cols[i].w - 6, ellipsis: true, lineBreak: false }); x += cols[i].w; });
    y += 18;
    if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
  };
  drawRow(cols.map((c) => c.l), true);
  doc.moveTo(40, y - 4).lineTo(doc.page.width - 40, y - 4).strokeColor('#d1d5db').stroke();
  const ngn = (n: number) => `NGN ${Math.round(n).toLocaleString('en-NG')}`; // PDF core fonts lack the ₦ glyph
  for (const r of rows) {
    drawRow([r.date, String(r.client ?? ''), [r.estate, r.product].filter(Boolean).join(' · '), ngn(r.salePrice), ngn(r.commission), r.status]);
  }
  const totals = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.commission, 0);
  y += 8;
  doc.font('Helvetica-Bold').fontSize(10);
  for (const [label, statuses] of [['Pending', ['pending']], ['Earned (awaiting approval)', ['earned']], ['Approved (awaiting payout)', ['approved']], ['Paid', ['paid']]] as const) {
    doc.text(`${label}: ${ngn(totals([...statuses]))}`, 40, y);
    y += 16;
  }
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Commissions are calculated from firm rules on attributed sales. Disputes: contact your sales manager within 14 days.', 40, doc.page.height - 60, { width: doc.page.width - 80 });
  doc.end();
});
