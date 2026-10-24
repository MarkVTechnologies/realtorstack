import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { Booking, Commission, Conflict, Estate, Lead, Payment, RealtorProfile, ShareEvent, Touch, User } from '../models/index.js';
import { qstr } from '../lib/http.js';
import { forbidden } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { addDays, lagosDateKey } from '../lib/format.js';
import { can, ctx, isRealtor } from '../middleware/auth.js';

export const analyticsRouter = Router();

function period(req: Request) {
  const to = qstr(req.query.to) ? new Date(`${qstr(req.query.to)}T23:59:59+01:00`) : new Date();
  const from = qstr(req.query.from) ? new Date(`${qstr(req.query.from)}T00:00:00+01:00`) : addDays(to, -29);
  return { from, to };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Daily series in Lagos time, filled with zeros. */
function series(from: Date, to: Date, rows: { _id: string; n: number }[]) {
  const map = new Map(rows.map((r) => [r._id, r.n]));
  const out: { date: string; n: number }[] = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const key = lagosDateKey(d);
    out.push({ date: key, n: map.get(key) ?? 0 });
  }
  return out;
}

const dayGroup = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: 'Africa/Lagos' } });

async function funnel(tenantId: Types.ObjectId, from: Date, to: Date, realtorId?: Types.ObjectId) {
  const r = realtorId ? { realtorId } : {};
  const [visits, leads, bookings, attended, payments, sales, visitSeries, leadSeries, attendedLeadIds] = await Promise.all([
    Touch.countDocuments({ tenantId, ...r, type: { $in: ['visit', 'shortlink'] }, at: { $gte: from, $lte: to } }),
    Lead.countDocuments({ tenantId, ...r, status: { $ne: 'merged' }, createdAt: { $gte: from, $lte: to } }),
    Booking.countDocuments({ tenantId, ...r, createdAt: { $gte: from, $lte: to } }),
    Booking.countDocuments({ tenantId, ...r, status: 'attended', slotAt: { $gte: from, $lte: to } }),
    Payment.aggregate([{ $match: { tenantId, ...r, status: 'success', paidAt: { $gte: from, $lte: to } } }, { $group: { _id: null, amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Lead.countDocuments({ tenantId, ...r, 'sale.startedAt': { $gte: from, $lte: to } }),
    Touch.aggregate([{ $match: { tenantId, ...r, type: { $in: ['visit', 'shortlink'] }, at: { $gte: from, $lte: to } } }, { $group: { _id: dayGroup('at'), n: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { tenantId, ...r, status: { $ne: 'merged' }, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: dayGroup('createdAt'), n: { $sum: 1 } } }]),
    Booking.distinct('leadId', { tenantId, ...r, status: 'attended', slotAt: { $gte: from, $lte: to } }),
  ]);
  const attendedThenBought = attendedLeadIds.length ? await Lead.countDocuments({ tenantId, _id: { $in: attendedLeadIds }, 'sale.productId': { $exists: true } }) : 0;
  return {
    totals: { visits, leads, bookings, attended, payments: payments[0]?.n ?? 0, paymentAmount: payments[0]?.amount ?? 0, sales },
    conversion: { visitToLead: pct(leads, visits), leadToInspection: pct(bookings, leads), inspectionToSale: pct(attendedThenBought, attendedLeadIds.length) },
    series: { visits: series(from, to, visitSeries), leads: series(from, to, leadSeries) },
  };
}

/** AN-01: firm dashboard. */
analyticsRouter.get('/firm', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  if (!can(auth.role, 'analytics.firm')) throw forbidden();
  const { from, to } = period(req);
  const [base, byEstate, byRealtor, byChannel, attributed, statusBreakdown, activeRealtors, sharingRealtors, openConflicts] = await Promise.all([
    funnel(tenantId, from, to),
    Lead.aggregate([
      { $match: { tenantId, status: { $ne: 'merged' }, createdAt: { $gte: from, $lte: to } } },
      { $unwind: '$estateIds' },
      { $group: { _id: '$estateIds', leads: { $sum: 1 }, sales: { $sum: { $cond: [{ $ifNull: ['$sale.productId', false] }, 1, 0] } } } },
    ]),
    Lead.aggregate([
      { $match: { tenantId, status: { $ne: 'merged' }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$realtorId', leads: { $sum: 1 }, sales: { $sum: { $cond: [{ $ifNull: ['$sale.productId', false] }, 1, 0] } }, salesValue: { $sum: { $ifNull: ['$sale.price', 0] } } } },
      { $sort: { leads: -1 } },
      { $limit: 20 },
    ]),
    Touch.aggregate([{ $match: { tenantId, type: { $in: ['visit', 'shortlink'] }, at: { $gte: from, $lte: to } } }, { $group: { _id: '$channel', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Lead.aggregate([
      { $match: { tenantId, 'sale.startedAt': { $gte: from, $lte: to } } },
      { $group: { _id: { $cond: [{ $ifNull: ['$realtorId', false] }, 'realtor', 'house'] }, n: { $sum: 1 } } },
    ]),
    Lead.aggregate([{ $match: { tenantId, status: { $ne: 'merged' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.countDocuments({ tenantId, role: 'realtor', status: 'active' }),
    ShareEvent.distinct('realtorId', { tenantId, at: { $gte: from, $lte: to } }),
    Conflict.countDocuments({ tenantId, status: 'open' }),
  ]);
  const estates = await Estate.find({ tenantId, _id: { $in: byEstate.map((e) => e._id) } }).select('name').lean();
  const realtorUsers = await User.find({ tenantId, _id: { $in: byRealtor.map((r) => r._id).filter(Boolean) } }).select('name').lean();
  const attributedSales = attributed.find((a) => a._id === 'realtor')?.n ?? 0;
  const allSales = attributed.reduce((s, a) => s + a.n, 0);
  res.json({
    period: { from, to },
    ...base,
    byEstate: byEstate.map((e) => ({ id: String(e._id), name: estates.find((x) => String(x._id) === String(e._id))?.name ?? 'Unknown', leads: e.leads, sales: e.sales })).sort((a, b) => b.leads - a.leads),
    byRealtor: byRealtor.map((r) => ({ id: r._id ? String(r._id) : null, name: r._id ? realtorUsers.find((u) => String(u._id) === String(r._id))?.name ?? 'Unknown' : 'House', leads: r.leads, sales: r.sales, salesValue: r.salesValue })),
    byChannel: byChannel.map((c) => ({ channel: c._id ?? 'direct', n: c.n })),
    attributedRevenueShare: pct(attributedSales, allSales),
    pipeline: Object.fromEntries(statusBreakdown.map((s) => [s._id, s.n])),
    realtors: { active: activeRealtors, sharing: sharingRealtors.length, monthlyActiveRate: pct(sharingRealtors.length, activeRealtors) },
    openConflicts,
  });
});

/** AN-03: realtor dashboard — clicks, leads, bookings, client statuses, commission. */
analyticsRouter.get('/realtor', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  let realtorId: Types.ObjectId;
  if (isRealtor(req)) realtorId = auth.userId;
  else if (can(auth.role, 'realtors.read') && qstr(req.query.realtorId)) realtorId = new Types.ObjectId(qstr(req.query.realtorId)!);
  else throw forbidden();
  const { from, to } = period(req);
  const [base, statuses, commissions, upcoming] = await Promise.all([
    funnel(tenantId, from, to, realtorId),
    Lead.aggregate([{ $match: { tenantId, realtorId, status: { $ne: 'merged' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Commission.aggregate([{ $match: { tenantId, realtorId, status: { $ne: 'void' } } }, { $group: { _id: '$status', amount: { $sum: '$amount' } } }]),
    Booking.find({ tenantId, realtorId, status: 'booked', slotAt: { $gte: new Date() } }).sort({ slotAt: 1 }).limit(5).lean(),
  ]);
  const estates = await Estate.find({ tenantId, _id: { $in: upcoming.map((b) => b.estateId) } }).select('name').lean();
  res.json({
    ...base,
    clientStatuses: Object.fromEntries(statuses.map((s) => [s._id, s.n])),
    commission: Object.fromEntries(commissions.map((c) => [c._id, c.amount])),
    upcomingInspections: upcoming.map((b) => ({ ...b, estate: estates.find((e) => String(e._id) === String(b.estateId))?.name })),
  });
});

/** Leaderboard / inactive realtors / per-realtor export (AN-02, AN-04, AN-05). */
analyticsRouter.get('/realtors', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  if (!can(auth.role, 'analytics.firm')) throw forbidden();
  const { from, to } = period(req);
  const users = await User.find({ tenantId, role: 'realtor', status: 'active' }).select('name phone').lean();
  const ids = users.map((u) => u._id);
  const [profiles, clicks, leads, bookings, sales, shares] = await Promise.all([
    RealtorProfile.find({ tenantId, userId: { $in: ids } }).select('userId code lastShareAt lastLeadAt').lean(),
    Touch.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, type: { $in: ['visit', 'shortlink'] }, at: { $gte: from, $lte: to } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, status: { $ne: 'merged' }, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, 'sale.startedAt': { $gte: from, $lte: to } } }, { $group: { _id: '$realtorId', n: { $sum: 1 }, value: { $sum: '$sale.price' } } }]),
    ShareEvent.aggregate([{ $match: { tenantId, realtorId: { $in: ids }, at: { $gte: from, $lte: to } } }, { $group: { _id: '$realtorId', n: { $sum: 1 } } }]),
  ]);
  const get = (rows: { _id: unknown; n: number; value?: number }[], id: unknown) => rows.find((r) => String(r._id) === String(id));
  const inactiveSince = addDays(new Date(), -30);
  const rows = users.map((u) => {
    const p = profiles.find((x) => String(x.userId) === String(u._id));
    const lastActive = [p?.lastShareAt, p?.lastLeadAt].filter(Boolean).map((d) => new Date(d!).getTime());
    return {
      id: String(u._id), name: u.name, phone: u.phone, code: p?.code,
      shares: get(shares, u._id)?.n ?? 0, clicks: get(clicks, u._id)?.n ?? 0, leads: get(leads, u._id)?.n ?? 0,
      bookings: get(bookings, u._id)?.n ?? 0, sales: get(sales, u._id)?.n ?? 0, salesValue: get(sales, u._id)?.value ?? 0,
      inactive: !lastActive.length || Math.max(...lastActive) < inactiveSince.getTime(),
      lastShareAt: p?.lastShareAt ?? null,
    };
  });
  const sortKey = (qstr(req.query.sort) ?? 'leads') as 'leads' | 'bookings' | 'salesValue' | 'clicks';
  rows.sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  if (req.query.format === 'csv') {
    res.type('text/csv').attachment('realtor-performance.csv').send(toCsv(rows.map(({ id: _id, ...r }) => r)));
    return;
  }
  res.json(rows);
});
