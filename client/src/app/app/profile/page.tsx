"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Camera, X } from "lucide-react";
import { api, uploadImage, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatPhone } from "@/lib/format";
import { Button, Card, ErrorNote, Field, Input, Loading, PageHeader, Textarea, Toggle, useToast } from "@/components/ui";
import { PasswordForm } from "@/components/app/PasswordForm";

interface Profile {
  code: string; slug: string; siteUrl: string; photoUrl?: string; bio?: string; whatsapp?: string; areasServed?: string[];
  featuredEstateIds: string[]; testimonials: { name: string; text: string }[];
  bank?: { bankName?: string; accountName?: string; accountNumberMasked?: string };
  allowEdit?: { bio?: boolean; photo?: boolean; featuredOrder?: boolean; testimonials?: boolean };
}

/** RS-03 / RM-03: realtors edit bio, photo, featured order, testimonials, WhatsApp and bank details. */
export default function ProfilePage() {
  const { session, refresh } = useSession();
  const toast = useToast();
  const { data, mutate } = useApi<Profile>("/realtors/me/profile");
  const { data: estates } = useApi<{ _id: string; name: string }[]>("/estates");
  const [draft, setDraft] = useState<Partial<Profile> | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [bankErr, setBankErr] = useState<unknown>(null);

  if (!data || !estates) return <Loading />;
  const p = { ...data, ...draft };
  const allow = data.allowEdit ?? {};
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const order = [...p.featuredEstateIds.filter((id) => estates.some((e) => e._id === id)), ...estates.map((e) => e._id).filter((id) => !p.featuredEstateIds.includes(id))];
  const move = (i: number, dir: -1 | 1) => { const n = [...order]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; set("featuredEstateIds", n); };

  async function save() {
    if (!draft) return;
    setBusy(true); setErr(null);
    try {
      await api("/realtors/me/profile", { method: "PATCH", body: { bio: draft.bio, photoUrl: draft.photoUrl, whatsapp: draft.whatsapp, areasServed: draft.areasServed, featuredEstateIds: draft.featuredEstateIds, testimonials: draft.testimonials } });
      setDraft(null); void mutate(); refresh(); toast("Profile saved — your site is updated");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="My profile" description={`This is what buyers see on ${data.siteUrl.replace(/^https?:\/\//, "")}`}
        actions={<><a href={data.siteUrl} target="_blank" rel="noopener" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium">Preview site</a><Button onClick={save} loading={busy} disabled={!draft}>Save changes</Button></>} />
      <ErrorNote error={err} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="About you">
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
                ) : <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-700 text-3xl font-bold text-white">{session.user.name.charAt(0)}</span>}
                {allow.photo !== false && (
                  <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-white p-2 shadow ring-1 ring-gray-200" aria-label="Change photo">
                    <Camera className="h-4 w-4" />
                    <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const img = await uploadImage(f); set("photoUrl", img.variants.sm ?? img.url); } catch (er) { toast((er as Error).message, "error"); } }} />
                  </label>
                )}
              </div>
              <div className="min-w-[220px] flex-1 space-y-3">
                <Field label="WhatsApp number" hint="Buyers' WhatsApp chats open with this number"><Input value={formatPhone(p.whatsapp) || p.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} type="tel" /></Field>
                <Field label="Areas you serve" hint="Comma-separated"><Input value={(p.areasServed ?? []).join(", ")} onChange={(e) => set("areasServed", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
              </div>
            </div>
            <Field label="Bio" className="mt-4" hint={allow.bio === false ? "Your firm manages bios" : "Tell buyers why they can trust you. 2–4 sentences works best."}>
              <Textarea rows={5} value={p.bio ?? ""} onChange={(e) => set("bio", e.target.value)} disabled={allow.bio === false} maxLength={1500} />
            </Field>
          </Card>
          <Card title="Featured estates order" actions={<span className="text-xs text-gray-500">Shown first on your home page</span>}>
            {allow.featuredOrder === false ? <p className="text-sm text-gray-500">Your firm controls the estate order.</p> : (
              <ol className="space-y-1">
                {order.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="w-5 text-gray-400">{i + 1}</span><span className="flex-1 font-medium">{estates.find((e) => e._id === id)?.name}</span>
                    <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-white disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                    <button disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-white disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Client testimonials" actions={allow.testimonials !== false && <Button size="sm" variant="secondary" onClick={() => set("testimonials", [...p.testimonials, { name: "", text: "" }])}>Add</Button>}>
            {allow.testimonials === false ? <p className="text-sm text-gray-500">Testimonials are disabled by your firm.</p> : p.testimonials.length === 0 ? <p className="text-sm text-gray-500">Add a few words from happy clients.</p> : (
              <div className="space-y-3">
                {p.testimonials.map((t, i) => (
                  <div key={i} className="grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-[180px_1fr_auto]">
                    <Input value={t.name} placeholder="Client name" className="mt-0" onChange={(e) => set("testimonials", p.testimonials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Textarea value={t.text} rows={2} placeholder="What they said" className="mt-0" onChange={(e) => set("testimonials", p.testimonials.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <button onClick={() => set("testimonials", p.testimonials.filter((_, j) => j !== i))} className="self-start rounded p-1 text-gray-500 hover:bg-white" aria-label="Remove"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Commission bank account">
            {data.bank?.accountNumberMasked && <p className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">{data.bank.bankName} · <span className="font-mono">{data.bank.accountNumberMasked}</span><br /><span className="text-gray-500">{data.bank.accountName}</span></p>}
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              setBankErr(null);
              try { await api("/realtors/me/bank", { method: "PUT", body: { bankName: fd.get("bankName"), accountName: fd.get("accountName"), accountNumber: String(fd.get("accountNumber")).replace(/\D/g, "") } }); form.reset(); void mutate(); toast("Bank details saved securely"); } catch (er) { setBankErr(er); }
            }}>
              <Field label="Bank"><Input name="bankName" required placeholder="e.g. GTBank" /></Field>
              <Field label="Account name"><Input name="accountName" required /></Field>
              <Field label="Account number (NUBAN)"><Input name="accountNumber" required inputMode="numeric" maxLength={10} /></Field>
              <ErrorNote error={bankErr} />
              <Button type="submit" variant="secondary" className="w-full">{data.bank?.accountNumberMasked ? "Update bank details" : "Save bank details"}</Button>
              <p className="text-xs text-gray-500">Encrypted at rest and masked after saving.</p>
            </form>
          </Card>
          <Card title="Account">
            <NotificationPrefs />
            <PasswordForm />
          </Card>
        </div>
      </div>
    </>
  );
}

function NotificationPrefs() {
  const { session, refresh } = useSession();
  const prefs = session.user.notificationPrefs ?? { email: true, inApp: true };
  const update = async (k: "email" | "inApp", v: boolean) => { await api("/auth/me", { method: "PATCH", body: { notificationPrefs: { ...prefs, [k]: v } } }); refresh(); };
  return (
    <div className="mb-4 divide-y divide-gray-100">
      <Toggle checked={prefs.inApp} onChange={(v) => void update("inApp", v)} label="In-app notifications" />
      <Toggle checked={prefs.email} onChange={(v) => void update("email", v)} label="Email notifications" description="New leads, payments, commission updates" />
    </div>
  );
}
