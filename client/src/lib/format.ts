const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export const formatNaira = (n: number | null | undefined) => (n == null ? "—" : naira.format(n));

/** ₦6.5M / ₦850k — compact for cards and share captions. */
export function formatNairaShort(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `₦${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `₦${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `₦${trim(n / 1_000)}k`;
  return `₦${n}`;
}
const trim = (v: number) => (Math.round(v * 10) / 10).toString();

const TZ = "Africa/Lagos";
export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-NG", { timeZone: TZ, ...opts }).format(new Date(d));
}
export const formatDateTime = (d: string | Date | null | undefined) => formatDate(d, { dateStyle: "medium", timeStyle: "short" });

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(d);
}

/** +2348031234567 → 0803 123 4567 */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

export const waDigits = (e164: string) => e164.replace(/^\+/, "");

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  inspection_booked: "Inspection booked",
  inspected: "Inspected",
  paid_deposit: "Paid deposit",
  installment: "Installment",
  completed: "Completed",
  lost: "Lost",
  merged: "Merged",
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Platform admin",
  owner: "Owner",
  admin: "Admin",
  sales_manager: "Sales manager",
  finance: "Finance",
  realtor: "Realtor",
};

export const RULE_LABEL: Record<string, string> = {
  first_touch: "First touch",
  last_touch: "Last touch",
  window_expired: "Window expired → new realtor",
  house: "House (no realtor link)",
  house_round_robin: "House → round-robin",
  claimed_from_house: "Claimed from House",
  manual: "Manual (offline)",
  override: "Admin override",
  reassigned: "Reassigned",
  conflict_resolution: "Conflict resolution",
};

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", x: "X", linkedin: "LinkedIn", tiktok: "TikTok",
  qr: "QR code", sms: "SMS", email: "Email", direct: "Direct", other: "Other",
};

export function locationLine(loc?: { area?: string | null; lga?: string | null; state?: string | null } | null) {
  if (!loc) return "";
  return [loc.area, loc.lga, loc.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}
