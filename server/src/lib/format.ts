const TZ = 'Africa/Lagos';
const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export const formatNaira = (n: number) => naira.format(n || 0);

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM-DD in Lagos time. */
export function lagosDateKey(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Day of week (0 = Sunday) in Lagos time. */
export function lagosWeekday(d: Date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Lagos is UTC+1 all year (no DST), so a fixed offset is safe. */
export function lagosDateTime(dateKey: string, time: string) {
  return new Date(`${dateKey}T${/^\d{2}:\d{2}$/.test(time) ? time : '10:00'}:00+01:00`);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

/** month = YYYY-MM, in Lagos time. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(`${month}-01T00:00:00+01:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end: new Date(`${next}-01T00:00:00+01:00`) };
}

export function formatLagos(d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat('en-NG', { timeZone: TZ, ...opts }).format(d);
}
