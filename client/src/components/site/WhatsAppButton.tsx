"use client";

import { useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { postPublic } from "./visitor";

interface Props {
  firm: string;
  realtor: string;
  estate?: string;
  estateName?: string;
  whatsapp: string;
  realtorName: string;
  variant?: "floating" | "inline";
  label?: string;
}

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <FaWhatsapp className={className} aria-hidden="true" />;
}

/**
 * LC-02: click-to-WhatsApp with a pre-filled message referencing the property. The click is
 * logged; buyers can optionally leave their number first so the lead is captured even if the
 * chat happens off-platform.
 */
export function WhatsAppButton({ firm, realtor, estate, estateName, whatsapp, realtorName, variant = "inline", label }: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const message = estateName
    ? `Hello ${realtorName.split(" ")[0]}, I saw ${estateName} on your website and I'd like more details on prices and payment plans.`
    : `Hello ${realtorName.split(" ")[0]}, I found you on your website and I'm interested in your properties.`;
  const href = `https://wa.me/${whatsapp.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function go(withDetails?: { name: string; phone: string }) {
    postPublic("/whatsapp", { firm, realtor, estate, ...(withDetails ? { ...withDetails, consent: true } : {}) }).catch(() => {});
    setOpen(false);
    window.open(href, "_blank", "noopener");
  }

  const trigger =
    variant === "floating" ? (
      <button onClick={() => setOpen(true)} className="floating-wa group isolate fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 font-semibold text-white shadow-xl shadow-emerald-900/30 transition hover:scale-105 sm:bottom-6 sm:right-6 sm:px-5" aria-label={`Chat with ${realtorName} on WhatsApp`}>
        <WhatsAppIcon className="h-6 w-6" />
        <span className="hidden sm:inline">Chat on WhatsApp</span>
      </button>
    ) : (
      <button onClick={() => setOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3.5 font-semibold text-white shadow-md shadow-emerald-900/15 transition hover:brightness-95 active:scale-[0.98]">
        <WhatsAppIcon /> {label ?? "Chat on WhatsApp"}
      </button>
    );

  return (
    <>
      {trigger}
      <dialog ref={dialogRef} onClose={() => setOpen(false)} className="m-auto w-[min(92vw,420px)] animate-fade-up rounded-3xl p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm">
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void go({ name: String(fd.get("name") ?? ""), phone: String(fd.get("phone") ?? "") });
          }}
        >
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#25D366]/10 text-[#128C7E]"><WhatsAppIcon className="h-6 w-6" /></span><h2 className="text-lg font-bold">Chat with {realtorName}</h2></div>
          <p className="text-sm text-gray-600">Leave your number so {realtorName.split(" ")[0]} can call you back if you miss each other on WhatsApp.</p>
          <input name="name" placeholder="Your name" autoComplete="name" className="block w-full rounded-xl border border-gray-300 px-3.5 py-3 focus:border-[#25D366] focus:outline-none" />
          <input name="phone" type="tel" inputMode="tel" required placeholder="Phone, e.g. 0803 123 4567" autoComplete="tel" className="block w-full rounded-xl border border-gray-300 px-3.5 py-3 focus:border-[#25D366] focus:outline-none" />
          <p className="text-xs text-gray-500">By continuing you agree to be contacted about this property.</p>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3.5 font-semibold text-white shadow-md"><WhatsAppIcon /> Continue to WhatsApp</button>
          <button type="button" onClick={() => void go()} className="w-full py-1 text-sm text-gray-600 underline">Skip and open WhatsApp</button>
        </form>
      </dialog>
    </>
  );
}
