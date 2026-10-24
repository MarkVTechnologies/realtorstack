import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Booking, Estate, Lead, STATUS_RANK, User, type LeadStatus } from '../models/index.js';
import { pageParams, parse, param, qstr } from '../lib/http.js';
import { forbidden, notFound } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { can, ctx, isRealtor } from '../middleware/auth.js';
import { auditReq } from '../services/audit.js';

export const bookingsRouter = Router();

function filterFor(req: Parameters<typeof ctx>[0]) {
  const { tenantId, auth } = ctx(req);
  const f: Record<string, unknown> = { tenantId };
  if (isRealtor(req)) f.realtorId = auth.userId;
  else if (!can(auth.role, 'leads.all')) throw forbidden();
  const date = qstr(req.query.date);
  const from = qstr(req.query.from), to = qstr(req.query.to);
  if (date) f.dateKey = date;
  else if (from || to) f.dateKey = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const estate = qstr(req.query.estateId);
  if (estate) f.estateId = new Types.ObjectId(estate);
  const status = qstr(req.query.status);
  if (status) f.status = status;
  return f;
}

/** IB-03: all bookings per day / estate. */
bookingsRouter.get('/', async (req, res) => {
  const { tenantId } = ctx(req);
  const f = filterFor(req);
  const { page, limit, skip } = pageParams(req);
  const [items, total] = await Promise.all([
    Booking.find(f).sort({ slotAt: req.query.upcoming === '1' ? 1 : -1 }).skip(skip).limit(limit).lean(),
    Booking.countDocuments(f),
  ]);
  const estates = await Estate.find({ tenantId, _id: { $in: items.map((b) => b.estateId) } }).select('name inspection.meetingPoint').lean();
  const realtors = await User.find({ tenantId, _id: { $in: items.map((b) => b.realtorId).filter(Boolean) } }).select('name').lean();
  res.json({
    items: items.map((b) => ({
      ...b,
      estate: estates.find((e) => String(e._id) === String(b.estateId)) ?? null,
      realtor: realtors.find((r) => String(r._id) === String(b.realtorId)) ?? null,
    })),
    total, page, limit,
  });
});

bookingsRouter.get('/export.csv', async (req, res) => {
  const { tenantId } = ctx(req);
  const items = await Booking.find(filterFor(req)).sort({ slotAt: 1 }).limit(20000).lean();
  const estates = await Estate.find({ tenantId }).select('name').lean();
  const realtors = await User.find({ tenantId, role: 'realtor' }).select('name').lean();
  res.type('text/csv').attachment('inspections.csv').send(
    toCsv(items.map((b) => ({
      date: b.dateKey, time: b.time, estate: estates.find((e) => String(e._id) === String(b.estateId))?.name, name: b.name, phone: b.phone, email: b.email,
      attendees: b.attendees, realtor: realtors.find((r) => String(r._id) === String(b.realtorId))?.name ?? 'House', status: b.status,
    }))),
  );
});

/** Mark attended / no-show / cancelled. Attendance moves the lead to "Inspected". */
bookingsRouter.patch('/:id', async (req, res) => {
  const { tenantId, auth } = ctx(req);
  if (!can(auth.role, 'bookings.manage') && !isRealtor(req)) throw forbidden();
  const body = parse(z.object({ status: z.enum(['booked', 'attended', 'no_show', 'cancelled']), note: z.string().max(300).optional() }), req.body);
  const booking = await Booking.findOne({ ...filterFor(req), _id: param(req, 'id') });
  if (!booking) throw notFound('Booking');
  const before = booking.status;
  booking.status = body.status;
  if (body.note) booking.note = body.note;
  await booking.save();
  const lead = await Lead.findOne({ tenantId, _id: booking.leadId });
  if (lead) {
    lead.activity.push({ at: new Date(), actorId: auth.userId, action: `inspection.${body.status}`, detail: `${booking.dateKey} ${booking.time}` });
    if (body.status === 'attended' && STATUS_RANK[lead.status as LeadStatus] < STATUS_RANK.inspected) lead.status = 'inspected';
    await lead.save();
  }
  await auditReq(req, { action: 'booking.status', entity: 'Booking', entityId: booking._id, before: { status: before }, after: { status: body.status } });
  res.json(booking);
});
