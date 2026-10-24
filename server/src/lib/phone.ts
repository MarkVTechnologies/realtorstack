import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Normalise Nigerian-style phone input ("0803...", "234803...", "+234 803 ...") to E.164 (+234...). */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const cleaned = String(input).trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  const candidate = cleaned.startsWith('234') ? `+${cleaned}` : cleaned;
  const parsed = parsePhoneNumberFromString(candidate, 'NG');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** wa.me links need the number without "+". */
export function whatsappDigits(e164: string) {
  return e164.replace(/^\+/, '');
}
