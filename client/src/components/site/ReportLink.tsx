"use client";

import { useRef, useState } from "react";

/** Abuse reporting on every page (fraudulent listing mitigation). */
export function ReportLink({ firm }: { firm: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState(false);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="underline hover:text-white">Report this page</button>
      <dialog ref={ref} className="m-auto w-[min(92vw,420px)] rounded-2xl p-0 text-gray-900 backdrop:bg-black/50">
        {sent ? (
          <div className="space-y-3 p-5">
            <p className="font-semibold">Thanks — our team will review this page.</p>
            <button className="rounded-lg bg-gray-900 px-4 py-2 text-white" onClick={() => ref.current?.close()}>Close</button>
          </div>
        ) : (
          <form
            className="space-y-3 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await fetch("/api/public/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firm, url: window.location.href, reason: fd.get("reason"), contact: fd.get("contact") || undefined }) }).catch(() => {});
              setSent(true);
            }}
          >
            <h2 className="text-lg font-semibold">Report this page</h2>
            <p className="text-sm text-gray-600">Tell RealtorStack if this listing looks fraudulent or misleading.</p>
            <textarea name="reason" required minLength={5} rows={4} className="block w-full rounded-lg border border-gray-300 p-2" placeholder="What is wrong?" />
            <input name="contact" className="block w-full rounded-lg border border-gray-300 p-2" placeholder="Your phone or email (optional)" />
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-white">Send report</button>
              <button type="button" className="rounded-lg px-4 py-2" onClick={() => ref.current?.close()}>Cancel</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
