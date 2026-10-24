"use client";

import { useEffect, useMemo, useState } from "react";
import { postPublic } from "./visitor";

interface Slot { date: string; time: string; at: string; remaining: number | null }
interface Confirmation { estate: string; when: string; meetingPoint: string; transportNotes: string; contact: { name: string; phone: string } }

const dayFmt = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });
const wdFmt = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short" });
const monFmt = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", month: "short" });
const timeFmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** IB-01 / IB-02: choose from the estate's available slots; confirmation shown on screen. */
export function BookingWidget({ firm, realtor, estate, estateName, privacyHref }: { firm: string; realtor: string; estate: string; estateName: string; privacyHref: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/sites/${firm}/estates/${estate}/slots`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Slot[]) => {
        if (cancelled) return;
        setSlots(s);
        if (s[0]) setDate(s[0].date);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => { cancelled = true; };
  }, [firm, estate]);

  const days = useMemo(() => [...new Set((slots ?? []).map((s) => s.date))], [slots]);
  const times = useMemo(() => (slots ?? []).filter((s) => s.date === date), [slots, date]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !time) return setError("Choose a date and time");
    const fd = new FormData(e.currentTarget);
    setSending(true);
    setError(null);
    try {
      const res = await postPublic<Confirmation>("/bookings", {
        firm, realtor, estate, date, time,
        name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email") || "",
        attendees: Number(fd.get("attendees") ?? 1), consent: fd.get("consent") === "on", website: fd.get("website") || undefined,
      });
      setDone(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="animate-fade-up rounded-3xl bg-brand-soft p-6" role="status">
        <span className="mb-3 flex h-12 w-12 animate-pop items-center justify-center rounded-full bg-brand text-xl text-brand-ink">✓</span>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-strong">Inspection booked</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">{done.estate}</h3>
        <dl className="mt-4 space-y-2 text-sm text-gray-800">
          <div><dt className="font-semibold">When</dt><dd>{done.when}</dd></div>
          <div><dt className="font-semibold">Meeting point</dt><dd>{done.meetingPoint}</dd></div>
          {done.transportNotes && <div><dt className="font-semibold">Transport</dt><dd>{done.transportNotes}</dd></div>}
          <div><dt className="font-semibold">Your contact</dt><dd>{done.contact.name} · <a className="underline" href={`tel:${done.contact.phone}`}>{done.contact.phone}</a></dd></div>
        </dl>
        <p className="mt-4 text-xs text-gray-600">We have also sent these details to your phone.</p>
      </div>
    );
  }

  const field = "mt-1.5 block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_25%,white)]";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Book a free site inspection</h3>
        <p className="text-sm text-gray-600">{estateName}</p>
      </div>
      {loadError && <p className="text-sm text-red-700">Could not load available dates. Please refresh or contact the realtor.</p>}
      {!slots && !loadError && <div className="h-20 animate-pulse rounded-xl bg-gray-100" aria-label="Loading dates" />}
      {slots && slots.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No inspection dates are open right now. Send an enquiry and we&apos;ll arrange one for you.</p>}
      {days.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-800">Date</legend>
          <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button type="button" key={d} onClick={() => { setDate(d); setTime(null); }} aria-pressed={date === d}
                className={`flex w-[68px] shrink-0 flex-col items-center rounded-2xl border py-2.5 transition ${date === d ? "border-brand bg-brand text-brand-ink shadow-md" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">{wdFmt.format(new Date(`${d}T12:00:00+01:00`))}</span>
                <span className="text-xl font-bold leading-tight">{Number(d.slice(8))}</span>
                <span className="text-[11px] opacity-75">{monFmt.format(new Date(`${d}T12:00:00+01:00`))}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {times.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-800">Time</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {times.map((s) => (
              <button type="button" key={s.at} onClick={() => setTime(s.time)} aria-pressed={time === s.time}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${time === s.time ? "border-brand bg-brand text-brand-ink shadow-md" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"}`}>
                {timeFmt(s.time)}{s.remaining !== null && <span className="ml-1 opacity-75">· {s.remaining} seats</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {time && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-800">Full name<input name="name" required minLength={2} autoComplete="name" className={field} /></label>
          <label className="block text-sm font-medium text-gray-800">Phone<input name="phone" required type="tel" inputMode="tel" autoComplete="tel" className={field} placeholder="0803 123 4567" /></label>
          <label className="block text-sm font-medium text-gray-800">Email <span className="font-normal text-gray-500">(optional)</span><input name="email" type="email" autoComplete="email" className={field} /></label>
          <label className="block text-sm font-medium text-gray-800">People coming
            <select name="attendees" className={field} defaultValue="1">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2">
            <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span>I agree to be contacted about this inspection. <a href={privacyHref} className="underline">Privacy notice</a>.</span>
          </label>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={!time || sending} className="w-full rounded-2xl bg-brand px-5 py-3.5 font-semibold text-brand-ink shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
        {sending ? "Booking…" : time ? `Book ${date ? dayFmt.format(new Date(`${date}T12:00:00+01:00`)) : ""} at ${timeFmt(time)}` : "Choose a time"}
      </button>
    </form>
  );
}
