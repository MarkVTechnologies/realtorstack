"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useRef } from "react";
import { motion } from "motion/react";
import { toast, ToastContainer } from "react-toastify";
import { LuInbox, LuTriangleAlert } from "react-icons/lu";
import { LEAD_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

/** @deprecated use cn() — kept for existing call sites */
export const cx = cn;

// ---- Buttons ---------------------------------------------------------------------------------

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-emerald-700 text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-800",
  secondary: "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 shadow-sm hover:bg-gray-50",
  ghost: "text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  soft: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
};
const btnBase = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
const btnSize = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-sm" } as const;

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} disabled={disabled || loading} className={cn(btnBase, btnSize[size], BTN[variant], className)} {...rest}>
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);

export function LinkButton({ href, variant = "primary", size = "md", className, children, ...rest }: React.ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return <Link href={href} className={cn(btnBase, btnSize[size], BTN[variant], className)} {...rest}>{children}</Link>;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// ---- Form fields -----------------------------------------------------------------------------

const fieldCls =
  "mt-1.5 block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-gray-50 disabled:text-gray-500";

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="font-medium text-gray-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldCls, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cn(fieldCls, "pr-8", className)} {...rest}>{children}</select>;
});

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-emerald-600" : "bg-gray-300")}>
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 35 }} className={cn("h-5 w-5 rounded-full bg-white shadow", checked && "ml-auto")} />
      </button>
    </div>
  );
}

// ---- Layout ----------------------------------------------------------------------------------

export function Card({ children, className, title, actions, padded = true, icon }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode; padded?: boolean; icon?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl bg-white shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
          {title && <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">{icon && <span className="text-emerald-700">{icon}</span>}{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7">
      {back && <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-emerald-700">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-950">{title}</h1>
          {description && <div className="mt-1.5 text-sm text-gray-600">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STAT_TONES = {
  emerald: "bg-emerald-50 text-emerald-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  gray: "bg-gray-100 text-gray-600",
} as const;

export function Stat({ label, value, sub, tone, icon, color = "emerald" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn"; icon?: React.ReactNode; color?: keyof typeof STAT_TONES }) {
  return (
    <div className="group rounded-2xl bg-white p-4 shadow-[var(--shadow-soft)] ring-1 ring-gray-200/70 transition hover:shadow-[var(--shadow-lift)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-gray-500">{label}</p>
        {icon && <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[18px]", STAT_TONES[tone === "warn" ? "amber" : color])}>{icon}</span>}
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-[28px]", tone === "warn" ? "text-amber-700" : "text-gray-950")}>{value}</p>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden="true" />;
}

export function Empty({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl text-gray-400">{icon ?? <LuInbox />}</span>
      <p className="font-semibold text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Skeleton placeholder shaped like a list/table — feels faster than a spinner. */
export function Loading({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200" role="alert">
      <LuTriangleAlert className="mt-0.5 shrink-0" /> {(error as Error).message ?? String(error)}
    </p>
  );
}

// ---- Avatar ----------------------------------------------------------------------------------

const AVATAR_COLORS = ["bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", className)} style={{ width: size, height: size }} />;
  }
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white", color, className)} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials}</span>;
}

// ---- Badges ----------------------------------------------------------------------------------

const TONES = {
  gray: "bg-gray-100 text-gray-700 ring-gray-500/10",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
} as const;
const DOT = { gray: "bg-gray-400", green: "bg-emerald-500", blue: "bg-sky-500", amber: "bg-amber-500", red: "bg-red-500", purple: "bg-violet-500" } as const;

export function Badge({ children, tone = "gray", className, dot }: { children: React.ReactNode; tone?: keyof typeof TONES; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

const LEAD_TONE: Record<string, keyof typeof TONES> = {
  new: "blue", contacted: "gray", inspection_booked: "purple", inspected: "purple", paid_deposit: "amber", installment: "amber", completed: "green", lost: "red", merged: "gray",
};
export function LeadStatusBadge({ status }: { status: string }) {
  return <Badge dot tone={LEAD_TONE[status] ?? "gray"}>{LEAD_STATUS_LABEL[status] ?? status}</Badge>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  active: "green", pending: "amber", invited: "blue", suspended: "red", exited: "gray",
  earned: "blue", approved: "purple", paid: "green", void: "gray",
  booked: "blue", attended: "green", no_show: "red", cancelled: "gray",
  open: "amber", auto_resolved: "gray", resolved: "green", reviewed: "gray", actioned: "green",
  selling: "green", sold_out: "gray", coming_soon: "amber", paused: "amber",
  sent: "green", logged: "gray", failed: "red", queued: "blue",
};
export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return <Badge dot tone={STATUS_TONE[status] ?? "gray"}><span className="capitalize">{label}</span></Badge>;
}

// ---- Modal -----------------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[min(94vw,540px)] overflow-visible bg-transparent p-0 backdrop:bg-gray-950/50 backdrop:backdrop-blur-[2px]", wide && "w-[min(94vw,780px)]")}>
      {open && (
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="flex max-h-[86vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
          <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-950">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close">✕</button>
          </header>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">{footer}</footer>}
        </motion.div>
      )}
    </dialog>
  );
}

// ---- Toasts (react-toastify) -------------------------------------------------------------------

export function useToast() {
  return (text: string, tone: "ok" | "error" = "ok") => (tone === "ok" ? toast.success(text) : toast.error(text));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer position="bottom-center" autoClose={3500} hideProgressBar newestOnTop closeOnClick pauseOnFocusLoss={false} theme="light" />
    </>
  );
}

// ---- Table -----------------------------------------------------------------------------------

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <tr>{head.map((h, i) => <th key={i} className="bg-gray-50/70 px-5 py-3 first:rounded-tl-2xl last:rounded-tr-2xl">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 [&>tr]:transition-colors [&>tr:hover]:bg-gray-50/60">{children}</tbody>
      </table>
      {!hasRows && empty}
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-5 py-3.5 align-middle text-gray-800", className)}>{children}</td>;
}

/** Underline tabs with an animated indicator. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode }[] }) {
  const id = useId();
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn("relative shrink-0 px-3 pb-2.5 pt-2 text-sm font-medium transition-colors", value === t.value ? "text-emerald-800" : "text-gray-500 hover:text-gray-800")}>
          {t.label}
          {value === t.value && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-emerald-600" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
        </button>
      ))}
    </div>
  );
}

/** Pill filter group used across inboxes. */
export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[] }) {
  const id = useId();
  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={active}
            className={cn("relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", active ? "text-white" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:ring-gray-300")}>
            {active && <motion.span layoutId={`pill-${id}`} className="absolute inset-0 rounded-full bg-emerald-700" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{o.label}{!!o.count && <span className={cn("ml-1.5 tabular-nums", active ? "text-emerald-100" : "text-gray-400")}>{o.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Copy-to-clipboard with feedback. */
export function useCopy() {
  const notify = useToast();
  return async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      notify(label);
    } catch {
      notify("Could not copy — long-press to copy instead", "error");
    }
  };
}

/** Dependency-light animated bar chart for dashboards. */
export function Bars({ data, height = 140, label }: { data: { date: string; n: number }[]; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <div>
      <p className="mb-3 text-2xl font-bold tabular-nums text-gray-950">{total.toLocaleString()} <span className="text-sm font-medium text-gray-500">total</span></p>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={`${label}: ${total} total`}>
        {data.map((d, i) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%` }} transition={{ delay: i * 0.012, type: "spring", stiffness: 260, damping: 30 }}
              className={cn("w-full rounded-t-[4px]", d.n ? "bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-700 group-hover:to-emerald-500" : "bg-gray-100")} />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">{d.date.slice(5)} · {d.n}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-gray-400"><span>{data[0]?.date.slice(5)}</span><span>{data.at(-1)?.date.slice(5)}</span></div>
    </div>
  );
}
