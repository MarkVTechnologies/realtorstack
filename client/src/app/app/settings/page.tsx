"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Upload, X } from "lucide-react";
import { api, uploadImage, useApi } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { ROLE_LABEL, timeAgo } from "@/lib/format";
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea, Toggle, useCopy, useToast } from "@/components/ui";
import { PasswordForm } from "@/components/app/PasswordForm";

interface Firm {
  name: string; slug: string; logoUrl?: string; cacNumber?: string; siteUrl: string; privacyPolicy?: string; plan: string;
  brand: { primaryColor: string; accentColor: string; theme: string };
  contact: { phone?: string; email?: string; whatsapp?: string; address?: string; website?: string };
  registration: { enabled: boolean; requireApproval: boolean };
  settings: {
    attribution: { model: string; windowDays: number; identityKey: string; manualLeads: string; windowReset: string; houseRoundRobin: boolean };
    commission: { type: string; value: number; earnOn: string };
    site: { heroTitle?: string; heroSubtitle?: string; whyBuy: { title: string; text: string }[]; faqs: { q: string; a: string }[]; allowRealtorEdit: { bio: boolean; photo: boolean; featuredOrder: boolean; testimonials: boolean } };
    hidePaymentAmountsFromRealtors: boolean; defaultCaption: string;
  };
}
type Tab = "brand" | "attribution" | "commission" | "site" | "team" | "privacy" | "account";

function useFirmForm() {
  const { data, mutate } = useApi<Firm>("/firm", { revalidateOnFocus: false });
  // Edits live in `edits`; until the first edit the form shows the server copy.
  const [edits, setEdits] = useState<Firm | null>(null);
  const draft = edits ?? data ?? null;
  const setDraft = (fn: (d: Firm | null) => Firm) => setEdits((e) => fn(e ?? (data ? structuredClone(data) : null)));
  return { data, draft, setDraft, reset: () => { setEdits(null); void mutate(); } };
}

function SaveBar({ onSave, busy, err }: { onSave: () => void; busy: boolean; err: unknown }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      <ErrorNote error={err} />
      <Button onClick={onSave} loading={busy}>Save changes</Button>
    </div>
  );
}

function Team() {
  const { session } = useSession();
  const toast = useToast();
  const copy = useCopy();
  const { data, mutate } = useApi<{ id: string; name: string; email: string; role: string; status: string; lastLoginAt?: string }[]>("/firm/team");
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const update = async (id: string, body: Record<string, string>) => { try { await api(`/firm/team/${id}`, { method: "PATCH", body }); toast("Updated"); void mutate(); } catch (e) { toast((e as Error).message, "error"); } };
  return (
    <Card padded={false} title="Team members" actions={<Button size="sm" onClick={() => { setInvited(null); setErr(null); setInviting(true); }}>Invite staff</Button>}>
      {!data ? <Loading /> : (
        <Table head={["Name", "Role", "Status", "Last sign-in", ""]}>
          {data.map((u) => {
            const self = u.id === session.user.id;
            return (
              <tr key={u.id}>
                <Td><span className="font-medium">{u.name}</span>{self && <span className="text-xs text-gray-400"> (you)</span>}<p className="text-xs text-gray-500">{u.email}</p></Td>
                <Td>{self ? ROLE_LABEL[u.role] : (
                  <Select value={u.role} onChange={(e) => void update(u.id, { role: e.target.value })} className="mt-0 w-auto">
                    {["owner", "admin", "sales_manager", "finance"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                )}</Td>
                <Td><StatusBadge status={u.status} /></Td>
                <Td className="text-gray-500">{timeAgo(u.lastLoginAt)}</Td>
                <Td className="text-right">
                  {!self && u.status === "active" && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void update(u.id, { status: "suspended" })}>Suspend</Button>}
                  {!self && u.status === "suspended" && <Button size="sm" variant="ghost" onClick={() => void update(u.id, { status: "active" })}>Reactivate</Button>}
                  {u.status === "invited" && <Button size="sm" variant="ghost" onClick={async () => { const r = await api<{ inviteUrl: string }>(`/firm/team/${u.id}/resend`, { body: {} }); void copy(r.inviteUrl, "Invite resent — link copied"); }}>Resend</Button>}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite a team member">
        {invited ? (
          <div className="space-y-3"><p className="text-sm">Invite sent. Activation link:</p><Input readOnly value={invited} /><div className="flex justify-end"><Button onClick={() => setInviting(false)}>Done</Button></div></div>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try { const r = await api<{ inviteUrl: string }>("/firm/team", { body: { name: fd.get("name"), email: fd.get("email"), role: fd.get("role") } }); setInvited(r.inviteUrl); void mutate(); } catch (er) { setErr(er); }
          }}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Email"><Input name="email" type="email" required /></Field>
            <Field label="Role" hint="See the permissions matrix: admins manage settings & overrides, finance approves commissions.">
              <Select name="role" defaultValue="sales_manager">{["admin", "sales_manager", "finance", "owner"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
            </Field>
            <ErrorNote error={err} />
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setInviting(false)}>Cancel</Button><Button type="submit">Send invite</Button></div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

export default function SettingsPage() {
  const can = useCan();
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const canSettings = can("settings");
  const tabs: { value: Tab; label: string }[] = [
    ...(canSettings ? ([{ value: "brand", label: "Brand & contact" }, { value: "attribution", label: "Attribution" }, { value: "commission", label: "Commission" }, { value: "site", label: "Realtor sites" }] as const) : []),
    ...(can("team.manage") ? ([{ value: "team", label: "Team" }] as const) : []),
    ...(canSettings ? ([{ value: "privacy", label: "Privacy (NDPA)" }] as const) : []),
    { value: "account", label: "My account" },
  ];
  const tab = (sp.get("tab") as Tab) ?? tabs[0].value;
  const { draft, setDraft, reset } = useFirmForm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (!draft && canSettings) return <Loading />;
  const f = draft!;
  const patch = (fn: (d: Firm) => void) => setDraft((d) => { const n = structuredClone(d!); fn(n); return n; });

  async function save(body: Partial<Firm> | Record<string, unknown>) {
    setBusy(true); setErr(null);
    try { await api("/firm", { method: "PATCH", body }); toast("Saved — realtor sites updated"); reset(); refresh(); } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const a = f?.settings.attribution;
  return (
    <>
      <PageHeader title="Settings" description={f ? `${f.name} · ${f.siteUrl}` : undefined} />
      <Tabs value={tab} onChange={(t) => { router.replace(`/app/settings?tab=${t}`); setErr(null); }} tabs={tabs} />
      <div className="mt-6 max-w-4xl">
        {tab === "brand" && (
          <>
            <Card title="Brand">
              <div className="flex flex-wrap items-center gap-4">
                {f.logoUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.logoUrl} alt="Logo" className="h-16 w-16 rounded-lg border object-contain" />
                    <button className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow" onClick={() => patch((d) => { d.logoUrl = ""; })} aria-label="Remove logo"><X className="h-3 w-3" /></button>
                  </div>
                ) : <div className="flex h-16 w-16 items-center justify-center rounded-lg text-xl font-bold text-white" style={{ background: f.brand.primaryColor }}>{f.name.charAt(0)}</div>}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium">
                  <Upload className="h-4 w-4" /> Upload logo
                  <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const img = await uploadImage(file); patch((d) => { d.logoUrl = img.variants.sm ?? img.url; }); } catch (er) { toast((er as Error).message, "error"); } }} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field label="Firm name"><Input value={f.name} onChange={(e) => patch((d) => { d.name = e.target.value; })} /></Field>
                <Field label="Primary colour"><div className="mt-1 flex gap-2"><input type="color" value={f.brand.primaryColor} onChange={(e) => patch((d) => { d.brand.primaryColor = e.target.value; })} className="h-9 w-12 rounded border" aria-label="Primary colour picker" /><Input value={f.brand.primaryColor} onChange={(e) => patch((d) => { d.brand.primaryColor = e.target.value; })} className="mt-0" /></div></Field>
                <Field label="Accent colour"><div className="mt-1 flex gap-2"><input type="color" value={f.brand.accentColor} onChange={(e) => patch((d) => { d.brand.accentColor = e.target.value; })} className="h-9 w-12 rounded border" aria-label="Accent colour picker" /><Input value={f.brand.accentColor} onChange={(e) => patch((d) => { d.brand.accentColor = e.target.value; })} className="mt-0" /></div></Field>
              </div>
            </Card>
            <Card className="mt-6" title="Contact & registration">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sales phone"><Input value={f.contact.phone ?? ""} onChange={(e) => patch((d) => { d.contact.phone = e.target.value; })} /></Field>
                <Field label="WhatsApp (House leads)"><Input value={f.contact.whatsapp ?? ""} onChange={(e) => patch((d) => { d.contact.whatsapp = e.target.value; })} /></Field>
                <Field label="Email"><Input value={f.contact.email ?? ""} onChange={(e) => patch((d) => { d.contact.email = e.target.value; })} /></Field>
                <Field label="CAC / RC number"><Input value={f.cacNumber ?? ""} onChange={(e) => patch((d) => { d.cacNumber = e.target.value; })} /></Field>
                <Field label="Office address" className="sm:col-span-2"><Input value={f.contact.address ?? ""} onChange={(e) => patch((d) => { d.contact.address = e.target.value; })} /></Field>
              </div>
            </Card>
            <SaveBar busy={busy} err={err} onSave={() => void save({ name: f.name, logoUrl: f.logoUrl ?? "", cacNumber: f.cacNumber ?? "", brand: { primaryColor: f.brand.primaryColor, accentColor: f.brand.accentColor }, contact: f.contact })} />
          </>
        )}

        {tab === "attribution" && (
          <>
            <Card title="Attribution rule">
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <strong>The rule your realtors see:</strong>{" "}
                {a.model === "last_touch" ? "The realtor whose link the buyer most recently used gets credit" : "The realtor whose link the buyer first used gets credit"}, provided the buyer converts within {a.windowDays} days. A buyer&apos;s identity is their {a.identityKey === "phone_email" ? "phone number or email" : "phone number"}.
                {a.model === "first_touch_review" && " When two realtors have a valid claim, an admin reviews the evidence before deciding."}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Model"><Select value={a.model} onChange={(e) => patch((d) => { d.settings.attribution.model = e.target.value; })}><option value="first_touch">First touch</option><option value="last_touch">Last touch</option><option value="first_touch_review">First touch with admin review on conflict</option></Select></Field>
                <Field label="Attribution window"><Select value={a.windowDays} onChange={(e) => patch((d) => { d.settings.attribution.windowDays = Number(e.target.value); })}>{[30, 60, 90, 180].map((n) => <option key={n} value={n}>{n} days</option>)}</Select></Field>
                <Field label="Identity key"><Select value={a.identityKey} onChange={(e) => patch((d) => { d.settings.attribution.identityKey = e.target.value; })}><option value="phone">Phone number</option><option value="phone_email">Phone + email</option></Select></Field>
                <Field label="Offline / manual leads"><Select value={a.manualLeads} onChange={(e) => patch((d) => { d.settings.attribution.manualLeads = e.target.value; })}><option value="admin_only">Admins only</option><option value="realtor_request">Realtor request + admin approval</option></Select></Field>
                <Field label="Window reset"><Select value={a.windowReset} onChange={(e) => patch((d) => { d.settings.attribution.windowReset = e.target.value; })}><option value="never">Never</option><option value="on_booking">On new inspection booking</option></Select></Field>
              </div>
              <div className="mt-3"><Toggle checked={a.houseRoundRobin} onChange={(v) => patch((d) => { d.settings.attribution.houseRoundRobin = v; })} label="Round-robin House leads" description="Leads with no realtor link are assigned to active realtors in turn" /></div>
              <p className="mt-3 text-xs text-gray-500">Changes apply to new attribution decisions and are recorded in the audit log.</p>
            </Card>
            <SaveBar busy={busy} err={err} onSave={() => void save({ settings: { attribution: a } })} />
          </>
        )}

        {tab === "commission" && (
          <>
            <Card title="Default commission rule" actions={<span className="text-xs text-gray-500">Estates and products can override this</span>}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type"><Select value={f.settings.commission.type} onChange={(e) => patch((d) => { d.settings.commission.type = e.target.value; })}><option value="percent">Percentage of sale</option><option value="fixed">Fixed amount (₦)</option></Select></Field>
                <Field label={f.settings.commission.type === "percent" ? "Percentage" : "Amount (₦)"}><Input inputMode="decimal" value={f.settings.commission.value} onChange={(e) => patch((d) => { d.settings.commission.value = Number(e.target.value) || 0; })} /></Field>
                <Field label="Commission becomes earned"><Select value={f.settings.commission.earnOn} onChange={(e) => patch((d) => { d.settings.commission.earnOn = e.target.value; })}><option value="full_payment">When the client has fully paid</option><option value="deposit">When the deposit is received</option></Select></Field>
              </div>
              <div className="mt-3"><Toggle checked={f.settings.hidePaymentAmountsFromRealtors} onChange={(v) => patch((d) => { d.settings.hidePaymentAmountsFromRealtors = v; })} label="Hide payment amounts from realtors" description="Realtors still see their clients' payment status" /></div>
            </Card>
            <SaveBar busy={busy} err={err} onSave={() => void save({ settings: { commission: f.settings.commission, hidePaymentAmountsFromRealtors: f.settings.hidePaymentAmountsFromRealtors } })} />
          </>
        )}

        {tab === "site" && (
          <>
            <Card title="Home page">
              <Field label="Headline"><Input value={f.settings.site.heroTitle ?? ""} onChange={(e) => patch((d) => { d.settings.site.heroTitle = e.target.value; })} maxLength={120} /></Field>
              <Field label="Sub-headline" className="mt-3"><Textarea rows={2} value={f.settings.site.heroSubtitle ?? ""} onChange={(e) => patch((d) => { d.settings.site.heroSubtitle = e.target.value; })} maxLength={240} /></Field>
              <p className="mt-4 text-sm font-medium">Why buy with us</p>
              {f.settings.site.whyBuy.map((w, i) => (
                <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
                  <Input className="mt-0" value={w.title} placeholder="Title" onChange={(e) => patch((d) => { d.settings.site.whyBuy[i].title = e.target.value; })} />
                  <Input className="mt-0" value={w.text} placeholder="Text" onChange={(e) => patch((d) => { d.settings.site.whyBuy[i].text = e.target.value; })} />
                  <Button variant="ghost" onClick={() => patch((d) => { d.settings.site.whyBuy.splice(i, 1); })} aria-label="Remove"><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => patch((d) => { d.settings.site.whyBuy.push({ title: "", text: "" }); })}>Add reason</Button>
              <p className="mt-4 text-sm font-medium">FAQs</p>
              {f.settings.site.faqs.map((q, i) => (
                <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <Input className="mt-0" value={q.q} placeholder="Question" onChange={(e) => patch((d) => { d.settings.site.faqs[i].q = e.target.value; })} />
                  <Input className="mt-0" value={q.a} placeholder="Answer" onChange={(e) => patch((d) => { d.settings.site.faqs[i].a = e.target.value; })} />
                  <Button variant="ghost" onClick={() => patch((d) => { d.settings.site.faqs.splice(i, 1); })} aria-label="Remove"><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => patch((d) => { d.settings.site.faqs.push({ q: "", a: "" }); })}>Add FAQ</Button>
            </Card>
            <Card className="mt-6" title="What realtors can edit">
              <div className="divide-y divide-gray-100">
                {(["bio", "photo", "featuredOrder", "testimonials"] as const).map((k) => (
                  <Toggle key={k} checked={f.settings.site.allowRealtorEdit[k]} onChange={(v) => patch((d) => { d.settings.site.allowRealtorEdit[k] = v; })}
                    label={{ bio: "Bio", photo: "Profile photo", featuredOrder: "Featured estates order", testimonials: "Testimonials" }[k]} />
                ))}
              </div>
            </Card>
            <Card className="mt-6" title="Default share caption">
              <Textarea rows={3} value={f.settings.defaultCaption} onChange={(e) => patch((d) => { d.settings.defaultCaption = e.target.value; })} />
              <p className="mt-1 text-xs text-gray-500">Placeholders: {"{estate} {location} {price} {realtor} {phone} {link}"}. Estates can set their own caption.</p>
            </Card>
            <Card className="mt-6" title="Realtor self-registration">
              <Toggle checked={f.registration.enabled} onChange={(v) => patch((d) => { d.registration.enabled = v; })} label="Allow sign-up via recruitment link" />
              <Toggle checked={f.registration.requireApproval} onChange={(v) => patch((d) => { d.registration.requireApproval = v; })} label="Require admin approval" />
            </Card>
            <SaveBar busy={busy} err={err} onSave={() => void save({
              registration: f.registration,
              settings: { site: { heroTitle: f.settings.site.heroTitle ?? "", heroSubtitle: f.settings.site.heroSubtitle ?? "", whyBuy: f.settings.site.whyBuy.filter((w) => w.title), faqs: f.settings.site.faqs.filter((q) => q.q), allowRealtorEdit: f.settings.site.allowRealtorEdit }, defaultCaption: f.settings.defaultCaption },
            })} />
          </>
        )}

        {tab === "team" && <Team />}

        {tab === "privacy" && (
          <>
            <Card title="Privacy notice (Nigeria Data Protection Act 2023)">
              <p className="text-sm text-gray-600">Shown on every realtor site and linked from every lead form. Your firm is the data controller; RealtorStack (Mark V Technologies) is the processor. Leave blank to use the standard notice.</p>
              <Textarea rows={12} className="mt-3" value={f.privacyPolicy ?? ""} onChange={(e) => patch((d) => { d.privacyPolicy = e.target.value; })} />
            </Card>
            <SaveBar busy={busy} err={err} onSave={() => void save({ privacyPolicy: f.privacyPolicy ?? "" })} />
          </>
        )}

        {tab === "account" && <Card title="Password"><PasswordForm /></Card>}
      </div>
    </>
  );
}
