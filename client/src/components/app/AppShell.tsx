"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, Building2, CalendarDays, Coins, ExternalLink, FileClock, Home, Inbox, LogOut, Menu, Scale, Settings, Share2, Shield, UserRound, Users, Wallet, X,
} from "lucide-react";
import { api, useApi } from "@/lib/api";
import { SessionContext, type Session } from "@/lib/session";
import { ROLE_LABEL, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar, Skeleton, ToastProvider } from "@/components/ui";

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; show: (s: Session) => boolean }

const has = (s: Session, cap: string) => s.capabilities.includes(cap);
const isRealtor = (s: Session) => s.user.role === "realtor";

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Platform", items: [{ href: "/app/admin", label: "Firms", icon: Shield, show: (s) => s.user.role === "super_admin" }] },
  {
    group: "Sell",
    items: [
      { href: "/app", label: "Dashboard", icon: Home, show: (s) => !!s.tenant },
      { href: "/app/share", label: "Share & links", icon: Share2, show: isRealtor },
      { href: "/app/leads", label: "Leads", icon: Inbox, show: (s) => !!s.tenant },
      { href: "/app/bookings", label: "Inspections", icon: CalendarDays, show: (s) => !!s.tenant },
      { href: "/app/conflicts", label: "Conflicts", icon: Scale, show: (s) => has(s, "leads.all") },
    ],
  },
  {
    group: "Catalogue & network",
    items: [
      { href: "/app/estates", label: "Estates", icon: Building2, show: (s) => has(s, "estates.read") },
      { href: "/app/realtors", label: "Realtors", icon: Users, show: (s) => has(s, "realtors.read") },
      { href: "/app/profile", label: "My profile", icon: UserRound, show: isRealtor },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/app/commissions", label: "Commissions", icon: Coins, show: (s) => !!s.tenant },
      { href: "/app/payments", label: "Payments", icon: Wallet, show: (s) => has(s, "payments.ledger") || isRealtor(s) },
    ],
  },
  {
    group: "Workspace",
    items: [
      { href: "/app/settings", label: "Settings", icon: Settings, show: (s) => has(s, "settings") || has(s, "team.manage") },
      { href: "/app/audit", label: "Audit log", icon: FileClock, show: (s) => has(s, "audit.read") },
    ],
  },
];

function NavLinks({ session, onNavigate, conflicts, layoutKey }: { session: Session; onNavigate?: () => void; conflicts?: number; layoutKey: string }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6 px-3" aria-label="Dashboard">
      {NAV.map((g) => {
        const items = g.items.filter((n) => n.show(session));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((n) => {
                const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <li key={n.href}>
                    <Link href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
                      {active && <motion.span layoutId={`nav-active-${layoutKey}`} className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-inset ring-white/10" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      {active && <motion.span layoutId={`nav-bar-${layoutKey}`} className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-400" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <Icon className={cn("relative h-[18px] w-[18px]", active ? "text-emerald-300" : "text-white/45")} />
                      <span className="relative flex-1">{n.label}</span>
                      {n.href === "/app/conflicts" && !!conflicts && <span className="relative rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-5 text-amber-950">{conflicts}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

interface Notif { _id: string; title: string; body?: string; link?: string; readAt?: string; createdAt: string }

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onOut(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [ref, onOut, active]);
}

const popover = { initial: { opacity: 0, y: -6, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.98 }, transition: { duration: 0.15 } };

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { data, mutate } = useApi<{ items: Notif[]; unread: number }>("/notifications", { refreshInterval: 60_000 });
  const router = useRouter();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800" aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {!!data?.unread && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popover} className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] origin-top-right overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-lift)] ring-1 ring-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={async () => { await api("/notifications/read", { body: {} }); void mutate(); }}>Mark all read</button>
            </div>
            <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
              {(data?.items ?? []).map((n) => (
                <li key={n._id}>
                  <button className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50", !n.readAt && "bg-emerald-50/50")}
                    onClick={async () => {
                      setOpen(false);
                      if (!n.readAt) await api("/notifications/read", { body: { ids: [n._id] } }).catch(() => {});
                      void mutate();
                      if (n.link) router.push(n.link);
                    }}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-emerald-500")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-gray-600">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {data?.items.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-500">You&apos;re all caught up.</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-gray-100" aria-expanded={open} aria-label="Account menu">
        <Avatar name={session.user.name} src={session.realtor?.photoUrl} size={32} />
        <span className="hidden text-sm font-medium text-gray-800 md:inline">{session.user.name.split(" ")[0]}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popover} className="absolute right-0 z-40 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl bg-white p-1.5 shadow-[var(--shadow-lift)] ring-1 ring-gray-200">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-gray-900">{session.user.name}</p>
              <p className="truncate text-xs text-gray-500">{session.user.email ?? session.user.phone}</p>
              <p className="mt-1 text-xs font-medium text-emerald-700">{ROLE_LABEL[session.user.role]}{session.tenant ? ` · ${session.tenant.name}` : ""}</p>
            </div>
            <div className="my-1 h-px bg-gray-100" />
            {session.realtor && <Link href="/app/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><UserRound className="h-4 w-4" /> My profile</Link>}
            {session.tenant && <Link href="/app/settings?tab=account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Settings className="h-4 w-4" /> Account settings</Link>}
            <button onClick={onSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PendingApproval({ session }: { session: Session }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-[var(--shadow-lift)] ring-1 ring-gray-200">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl">⏳</span>
        <h1 className="mt-4 text-xl font-bold">Awaiting approval</h1>
        <p className="mt-2 text-gray-600">Thanks for registering with {session.tenant?.name}. A sales manager will approve your account shortly — you&apos;ll get a notification as soon as your site is live.</p>
        <button className="mt-6 text-sm text-gray-500 underline" onClick={async () => { await api("/auth/logout", { body: {} }); window.location.href = "/login"; }}>Sign out</button>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 bg-[var(--ink)] lg:block" />
      <div className="flex-1 space-y-6 p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, error, mutate } = useApi<Session>("/auth/me", { revalidateOnFocus: false });
  const { data: conflicts } = useApi<{ counts: Record<string, number> }>(session && session.capabilities.includes("leads.all") ? "/conflicts?status=open" : null, { refreshInterval: 120_000 });
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session?.user.role === "super_admin" && !pathname.startsWith("/app/admin")) router.replace("/app/admin");
  }, [session, pathname, router]);

  if (error) return <div className="p-8 text-center text-sm text-red-700">Could not load your account: {(error as Error).message}</div>;
  if (!session) return <ShellSkeleton />;
  if (session.user.status === "pending") return <PendingApproval session={session} />;

  const openConflicts = conflicts?.counts?.open ?? 0;
  const brand = session.tenant?.brand?.primaryColor ?? "#0f5132";
  const signOut = async () => {
    await api("/auth/logout", { body: {} });
    window.location.href = "/login";
  };

  const sidebar = (key: string) => (
    <div className="flex h-full flex-col bg-[var(--ink)] bg-[radial-gradient(120%_60%_at_0%_0%,rgb(16_185_129/0.12),transparent)]">
      <div className="flex items-center gap-3 px-5 pb-5 pt-5">
        {session.tenant?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.tenant.logoUrl} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white shadow-lg ring-1 ring-white/20" style={{ background: brand }}>{(session.tenant?.name ?? "R").charAt(0)}</span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{session.tenant?.name ?? "RealtorStack"}</p>
          <p className="truncate text-xs text-white/50">{session.tenant ? `${session.tenant.plan} plan` : "Platform operations"}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2"><NavLinks session={session} onNavigate={() => setMenuOpen(false)} conflicts={openConflicts} layoutKey={key} /></div>
      {session.realtor && (
        <div className="m-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="text-xs text-white/50">Your website</p>
          <a href={session.realtor.siteUrl} target="_blank" rel="noopener" className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-emerald-300 hover:text-emerald-200">
            <span className="truncate">{session.realtor.siteUrl.replace(/^https?:\/\//, "")}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      )}
      <p className="px-5 pb-4 pt-2 text-[11px] text-white/30">RealtorStack · Mark V</p>
    </div>
  );

  return (
    <SessionContext.Provider value={{ session, refresh: () => void mutate() }}>
      <ToastProvider>
        <div className="flex min-h-screen bg-[var(--background)]">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar("desktop")}</aside>
          <AnimatePresence>
            {menuOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-gray-950/50 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
                <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="absolute inset-y-0 left-0 w-72 shadow-2xl">
                  <button className="absolute right-3 top-5 z-10 rounded-lg p-1 text-white/60 hover:text-white" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
                  {sidebar("mobile")}
                </motion.aside>
              </div>
            )}
          </AnimatePresence>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-gray-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
              <button className="-ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
              <p className="truncate text-sm font-semibold text-gray-900 lg:hidden">{session.tenant?.name ?? "RealtorStack"}</p>
              <div className="flex-1" />
              {session.realtor && (
                <a href={session.realtor.siteUrl} target="_blank" rel="noopener" className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/15 transition hover:bg-emerald-100 sm:inline-flex">
                  <ExternalLink className="h-4 w-4" /> View my site
                </a>
              )}
              <Notifications />
              <UserMenu session={session} onSignOut={signOut} />
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 lg:px-8">
              {/* Enter-only transition: in the App Router the outgoing page is already replaced */}
              <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
                {children}
              </motion.div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </SessionContext.Provider>
  );
}
