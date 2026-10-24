"use client";

import { useMemo, useState } from "react";
import { LuCalendarClock, LuCheck, LuTag } from "react-icons/lu";
import type { PublicProduct } from "@/lib/site-data";
import { formatDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Prices and payment plans at a glance (persona Funmi: "will leave if she cannot see the price
 * and payment plan immediately"). Pick a plot, pick a plan, see deposit / monthly / total.
 */
export function PlanExplorer({ products }: { products: PublicProduct[] }) {
  const [pi, setPi] = useState(0);
  const product = products[pi];
  const options = useMemo(
    () => [
      { name: "Outright", depositAmount: product?.price ?? 0, tenorMonths: 0, monthlyAmount: 0, totalPrice: product?.price ?? 0 },
      ...(product?.plans ?? []),
    ],
    [product],
  );
  const [plan, setPlan] = useState(0);
  const chosen = options[Math.min(plan, options.length - 1)];

  if (!products.length) return <p className="text-gray-600">Prices coming soon — send an enquiry to be first to know.</p>;

  const finish = chosen.tenorMonths ? new Date(new Date().setMonth(new Date().getMonth() + chosen.tenorMonths)) : null;
  const extra = chosen.totalPrice - (product.price ?? 0);

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-soft)] ring-1 ring-gray-200">
      {/* Product tabs */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-gray-100 p-3" role="tablist" aria-label="Plot or unit type">
        {products.map((p, i) => (
          <button key={p.id} role="tab" aria-selected={i === pi} onClick={() => { setPi(i); setPlan(0); }}
            className={cn("shrink-0 rounded-2xl px-4 py-2.5 text-left transition", i === pi ? "bg-brand text-brand-ink shadow-sm" : "bg-gray-50 text-gray-800 hover:bg-gray-100")}>
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className={cn("block text-xs", i === pi ? "opacity-80" : "text-gray-500")}>{p.status === "sold_out" ? "Sold out" : `from ${formatNaira(p.price)}`}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
        {/* Plans */}
        <div className="space-y-2 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Choose how to pay</p>
          {options.map((o, i) => (
            <button key={o.name} onClick={() => setPlan(i)} aria-pressed={plan === i}
              className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition", plan === i ? "border-brand bg-brand-soft ring-1 ring-[var(--brand)]" : "border-gray-200 hover:border-gray-300")}>
              <span className="flex items-center gap-3">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px]", plan === i ? "border-brand bg-brand text-brand-ink" : "border-gray-300")}>{plan === i && <LuCheck />}</span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{o.name}</span>
                  <span className="block text-xs text-gray-500">{o.tenorMonths ? `${formatNaira(o.depositAmount)} deposit · ${o.tenorMonths} months` : "Pay once, best price"}</span>
                </span>
              </span>
              <span className="text-right text-sm font-bold tabular-nums text-gray-900">{o.tenorMonths ? `${formatNaira(o.monthlyAmount)}/mo` : formatNaira(o.totalPrice)}</span>
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-brand-deep relative overflow-hidden p-5 text-white sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <p className="relative text-xs font-semibold uppercase tracking-wider text-white/70">{product.name}{product.size ? ` · ${product.size}` : ""}</p>
          {product.promo && (
            <p className="relative mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-gray-900">
              <LuTag /> {product.promo.label ?? "Promo"}{product.promo.endsAt ? ` · ends ${formatDate(product.promo.endsAt, { day: "numeric", month: "short" })}` : ""}
            </p>
          )}
          <dl className="relative mt-4 space-y-3">
            {chosen.tenorMonths ? (
              <>
                <div className="flex items-baseline justify-between"><dt className="text-sm text-white/75">Deposit today</dt><dd className="text-2xl font-bold tabular-nums">{formatNaira(chosen.depositAmount)}</dd></div>
                <div className="flex items-baseline justify-between"><dt className="text-sm text-white/75">Then monthly</dt><dd className="text-lg font-semibold tabular-nums">{formatNaira(chosen.monthlyAmount)} × {chosen.tenorMonths}</dd></div>
              </>
            ) : (
              <div className="flex items-baseline justify-between"><dt className="text-sm text-white/75">One payment</dt><dd className="text-2xl font-bold tabular-nums">{formatNaira(chosen.totalPrice)}</dd></div>
            )}
            <div className="h-px bg-white/15" />
            <div className="flex items-baseline justify-between"><dt className="text-sm text-white/75">Total</dt><dd className="text-lg font-bold tabular-nums">{formatNaira(chosen.totalPrice)}</dd></div>
            {product.promo && !chosen.tenorMonths && <p className="text-xs text-white/70">Was <span className="line-through">{formatNaira(product.outrightPrice)}</span> — you save {formatNaira(product.outrightPrice - product.price)}</p>}
            {extra > 0 && <p className="text-xs text-white/70">Spreading payments adds {formatNaira(extra)} vs paying outright.</p>}
            {finish && <p className="flex items-center gap-1.5 text-xs text-white/70"><LuCalendarClock /> Fully paid by about {formatDate(finish, { month: "long", year: "numeric" })}</p>}
          </dl>
        </div>
      </div>
    </div>
  );
}
