# RealtorStack

Sales sites, lead attribution and commission tracking for Nigerian real estate firms and their realtor networks (see the PRD, v1.0).

> Every realtor gets a ready-to-share sales site in minutes. Every naira of sales is traced back to the realtor who earned it.

This repository contains the **MVP (pilot) scope** — every P0 requirement — plus a few cheap P1 items (promo pricing, inspection capacity, leaderboard, inactive-realtor report, link click tracking by channel).

| Folder | What | Stack |
| --- | --- | --- |
| `server/` | REST API, attribution engine, background jobs | Node 22, Express 5, MongoDB (Mongoose 9), Zod, BullMQ (optional) |
| `client/` | Public realtor sites **and** the firm / realtor / platform dashboards | Next.js 16 (App Router, Cache Components), React 19, Tailwind 4 |

## Quick start (local)

Requirements: Node 22+. MongoDB and Redis are **optional** locally — with `MONGO_URI` empty the API boots an embedded MongoDB (data in `server/.mongo-data`) and seeds a demo firm.

```bash
# API
cd server
cp .env.example .env        # then set FIELD_ENCRYPTION_KEY / JWT_SECRET (see comments)
npm install
npm run dev                 # http://localhost:4000

# Web (in another terminal)
cd client
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

If port 3000 is taken, run the client on another port (`npx next dev -p 3001`) and set `CLIENT_URL` in `server/.env` and `NEXT_PUBLIC_APP_URL` in `client/.env.local` to match.

### Demo data (seeded automatically in development)

Firm **Oakwood Homes & Estates** (`oakwood`) with three estates, five realtors, leads, an inspection, payments, commissions and an open attribution conflict.

| Who | Sign in |
| --- | --- |
| Owner / Admin / Sales manager / Finance | `owner@oakwood.ng`, `admin@oakwood.ng`, `sales@oakwood.ng`, `finance@oakwood.ng` — password `Password123!` |
| Realtor Tobi | `tobi@example.com` / `Password123!`, or phone OTP `0806 111 2222` (the code is shown on screen in development) |
| Platform super-admin | `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` from `server/.env` |

Try:

- Tobi's site: `/s/oakwood/tobi-adewale`
- A short link: `/l/tobi001/oak-gardens?c=whatsapp` (records the click, then redirects)
- The firm's House site: `/s/oakwood/main`
- The dashboard: `/app`

Set `SEED_DEMO=false` to skip seeding. To reset the demo, stop the API and delete `server/.mongo-data` and `server/uploads/*`.

## How it maps to the PRD

### Attribution (§9) — `server/src/services/attribution.ts`

- Every realtor link open is recorded as a **Touch**:
  - by the page beacon on realtor sites;
  - by the short-link redirect, server-side, so attribution survives blocked cookies.
- Touches are keyed by a first-party visitor cookie (`rs_vid`, issued by `client/src/proxy.ts`).
- When a visitor submits a form, leaves a number on the WhatsApp button, or books an inspection:
  - their phone number (normalised to +234) becomes the identity key;
  - their anonymous touches are bound to it.
- A **new identity** is credited to the first (or last) realtor touch inside the window. With no realtor touch the lead goes to **House**, optionally round-robin.
- A **known identity** arriving through another realtor's link keeps its realtor, unless:
  - the window has expired;
  - the firm uses last-touch;
  - or the lead is a House lead.
  The competing claim is always recorded in the **conflict queue**: *open* for review (first-touch-with-review model) or *auto-resolved* with the decision.
- Admin overrides and lead merges need a reason. They are written to the immutable audit log, and both realtors are notified. Unapproved commissions follow the corrected attribution.
- Firm settings: model, 30/60/90/180-day window, phone vs phone+email identity, offline-lead policy, window reset on booking, House round-robin.

### Commissions (AC-05 / AC-06)

- Rules resolve product → estate → firm default (percentage or fixed).
- Recording a sale payment against an attributed lead creates a **Pending** commission. It becomes **Earned** at full payment, or at deposit if the firm chooses. Finance then marks it **Approved** and **Paid**, with a payout reference.
- Monthly statements are available as PDF and CSV, per realtor or firm-wide.
- Payments are recorded manually in the MVP (bank transfers). Paystack/Flutterwave is Phase 2.

### Realtor sites (§8.4, §8.5)

- `client/src/app/s/[firm]/[realtor]/…`: home, properties, property detail, about, contact, book inspection, privacy, sitemap.
- Pages are cached with `use cache` + `cacheTag('firm:<slug>')`. The API calls `POST /api/revalidate` after any change to prices, estates, branding or a realtor profile, so updates appear on every realtor site immediately (PC-04).
- Open Graph cards (`/og/...`) show the estate photo, name, ₦ price and the realtor's name for WhatsApp/Facebook/X/LinkedIn previews.
- Canonical URLs point to the firm's main estate page, and property pages carry `RealEstateListing` JSON-LD.
- URLs: `{realtor}.{firm}.ROOT_DOMAIN` when `NEXT_PUBLIC_ROOT_DOMAIN` is set; otherwise `/s/{firm}/{realtor}`. `main` is the firm's House site. Short links live at `SHORT_DOMAIN/{code}/{estate}` or `/l/{code}/{estate}`.

### Security and data protection (§10)

- Tenant isolation is enforced by a Mongoose plugin that rejects any query on firm data without `tenantId`.
- Roles follow the §8.13 permissions matrix and are enforced server-side (`server/src/middleware/auth.ts`).
- Passwords are hashed with bcrypt, sessions use httpOnly cookies, and realtors can sign in with phone OTP.
- Requests are rate-limited, and public forms have a honeypot field.
- Bank and ID numbers are encrypted with AES-256-GCM and masked after saving.
- Lead forms carry an NDPA consent notice, and each firm has its own privacy notice.
- The audit log cannot be edited or deleted.

## Configuration

See `server/.env.example` and `client/.env.example`. Production needs:

- `MONGO_URI`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY` and `REVALIDATE_SECRET` (the same value on both apps)
- `CLIENT_URL` (API side) and `API_URL` (client side)
- optionally `REDIS_URL` for BullMQ
- `SMTP_*` for email; without it, emails and SMS are logged to the console

## Tests

```bash
cd server && npm test     # attribution engine, commissions, tenant isolation, API & role checks
cd client && npx tsc --noEmit && npm run lint && npm run build
```

## Not in this MVP (by design, per release scope)

Phase 2 items not built yet:

- online payments and installment reminders (Paystack/Flutterwave)
- WhatsApp/SMS delivery (Termii, WhatsApp Cloud API); the hooks are in `server/src/services/mailer.ts`
- the auto-branded flyer kit
- custom domains with automatic SSL
- self-serve billing
- S3 media storage (local disk is used; `server/src/services/storage.ts` has the seam)

Phase 3 items not built yet: team uplines, payout batch files, public API.
