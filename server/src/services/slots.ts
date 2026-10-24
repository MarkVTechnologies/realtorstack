import type { Types } from 'mongoose';
import { Booking, type EstateDoc } from '../models/index.js';
import { addDays, lagosDateKey, lagosDateTime, lagosWeekday } from '../lib/format.js';

export interface Slot {
  date: string; // YYYY-MM-DD (Lagos)
  time: string; // HH:mm
  at: string; // ISO
  remaining: number | null; // null = unlimited
}

/** IB-01 / IB-05: available inspection slots for an estate over its booking horizon. */
export async function availableSlots(tenantId: Types.ObjectId, estate: Pick<EstateDoc, '_id' | 'inspection'>, now = new Date()): Promise<Slot[]> {
  const insp = estate.inspection;
  const days = new Set(insp?.days ?? []);
  const times = [...(insp?.times ?? [])].sort();
  if (!days.size || !times.length) return [];
  const horizon = Math.min(insp?.daysAhead ?? 30, 90);
  const blackout = new Set(insp?.blackoutDates ?? []);
  const capacity = insp?.capacityPerSlot ?? 0;

  const candidates: Slot[] = [];
  for (let i = 0; i <= horizon; i++) {
    const day = addDays(now, i);
    const key = lagosDateKey(day);
    if (blackout.has(key) || !days.has(lagosWeekday(day))) continue;
    for (const time of times) {
      const at = lagosDateTime(key, time);
      // Require at least 2 hours' notice
      if (at.getTime() - now.getTime() < 2 * 3_600_000) continue;
      candidates.push({ date: key, time, at: at.toISOString(), remaining: null });
    }
  }
  if (!capacity || !candidates.length) return candidates;

  const taken = await Booking.aggregate<{ _id: { d: string; t: string }; n: number }>([
    { $match: { tenantId, estateId: estate._id, status: { $in: ['booked', 'attended'] }, dateKey: { $gte: candidates[0].date } } },
    { $group: { _id: { d: '$dateKey', t: '$time' }, n: { $sum: '$attendees' } } },
  ]);
  const used = new Map(taken.map((t) => [`${t._id.d} ${t._id.t}`, t.n]));
  return candidates
    .map((s) => ({ ...s, remaining: Math.max(0, capacity - (used.get(`${s.date} ${s.time}`) ?? 0)) }))
    .filter((s) => (s.remaining ?? 1) > 0);
}
