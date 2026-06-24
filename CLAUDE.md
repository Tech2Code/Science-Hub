@AGENTS.md

<!-- AUTO-MAINTAINED PROJECT CONTINUITY DOCUMENT — updated 2026-06-24 -->

# Project Overview

Science Hub is a GST billing and inventory management web app for a science supplies business. It handles invoice creation with auto-numbering, customer management, product/stock tracking, payment recording, PDF generation, email delivery of invoices, and admin/staff role management with activity logging.

---

# Tech Stack

- **Framework**: Next.js 16 App Router (all pages `"use client"`, no async server components)
- **Database**: PostgreSQL on Neon via Prisma ORM
- **Auth**: NextAuth v4 (CredentialsProvider + JWT sessions)
- **Email**: Nodemailer with Gmail SMTP (App Password)
- **PDF**: Client-side PDF generation (used on invoice detail page, sent via `/api/send-invoice`)
- **Styling**: CSS Modules + CSS variables (light/dark theme via localStorage)
- **Frontend Deployment**: Vercel
  **Database Deployment**: Neon

---

# Science Hub — Billing & Inventory

GST billing and inventory management app for a science supplies business. Next.js 16 App Router, PostgreSQL (Neon) via Prisma, NextAuth v4 (credentials + JWT).

---

## Project Structure

```
src/
  app/
    (dashboard)/          # All authenticated pages (route group, no URL segment)
      layout.tsx          # "use client" — sidebar, topbar, auth guard
      page.tsx            # Dashboard — KPI cards + recent invoices
      invoices/
        page.tsx          # Invoice list with status filter
        new/page.tsx      # Create invoice form
        [id]/page.tsx     # Invoice detail + payment recording
        edit/[id]/page.tsx
      customers/
        page.tsx          # Customer list
        new/page.tsx
        [id]/page.tsx     # Customer detail + invoice history
        edit/[id]/page.tsx
      products/
        page.tsx          # Product list
        new/page.tsx
        edit/[id]/page.tsx
      brands/page.tsx     # Brand CRUD
      payments/page.tsx   # Payment history
      reports/page.tsx    # Summary / outstanding / low-stock reports
    api/
      auth/[...nextauth]/ # NextAuth handler
      invoices/           # GET (list), POST (create)
        [id]/             # GET, PUT (edit/status), DELETE
          payment/        # POST (record payment)
      customers/          # GET, POST
        [id]/             # GET, PUT, DELETE
      products/           # GET (with ?search=), POST
        [id]/             # GET, PUT, DELETE
      brands/             # GET, POST
        [id]/             # DELETE
      categories/         # GET, POST
      payments/           # GET (all payments)
      reports/            # GET ?type=summary|outstanding|stock
      setup/              # POST (seed first admin user)
    layout.tsx            # Root server layout — fonts, Providers
    providers.tsx         # "use client" — SessionProvider + ThemeProvider
    login/page.tsx        # Login form
  components/             # Shared UI — Button, Input, Badge, Breadcrumb,
                          #   ConfirmDialog, Skeleton, Spinner
  lib/
    auth.ts               # NextAuth config (CredentialsProvider, JWT)
    db.ts                 # Server-side cached query helpers (unstable_cache)
    prisma.ts             # Prisma client singleton
    theme.tsx             # ThemeContext — light/dark via localStorage
    useCache.ts           # Client-side in-memory cache (TTL 2 min) + useFetch hook
    loading.tsx           # Full-screen loading component
  types/
    next-auth.d.ts        # Extends Session/JWT with id, role
prisma/
  schema.prisma           # PostgreSQL schema
  seed.ts                 # Seed script (npx tsx prisma/seed.ts)
```

---

## Key Files — Read Before Editing

| File | Why it matters |
|------|----------------|
| `src/lib/db.ts` | All server-side DB queries go here, wrapped in `unstable_cache`. Add new queries here, not directly in route handlers. |
| `src/lib/useCache.ts` | Client-side fetch + cache hook. `useFetch(url)` returns `{ data, loading, mutate }`. Call `mutate()` after mutations. `bustCache(url)` for one-off busting. |
| `src/lib/auth.ts` | NextAuth config. `NEXTAUTH_SECRET` must be a real secret in production. |
| `prisma/schema.prisma` | Source of truth for data model. Run `npx prisma migrate dev` after schema changes. |
| `src/app/api/invoices/route.ts` | Invoice number format is `SH-{YEAR}-{0001}`. Don't break that sequence logic. |

---

## Data Flow

All pages are `"use client"`. There are no async server components that fetch data.

```
Browser → useFetch("/api/...") → API Route Handler → unstable_cache → Prisma → Neon DB
                                         ↑ on mutation: revalidateTag(tag, { expire: 0 })
```

- **Reads**: `useFetch` hits API route → route handler calls `unstable_cache` wrapper → cache hit (fast) or DB query (first time / after mutation)
- **Writes**: POST/PUT/DELETE route handler mutates DB, then calls `revalidateTag` to expire server cache. Client calls `mutate()` to refresh its local state.

---

## Cache Tags

`revalidateTag(tag, { expire: 0 })` must be called after every mutation. Tags:

| Tag | Covers |
|-----|--------|
| `"invoices"` | Invoice list + individual invoice queries |
| `"customers"` | Customer list + individual customer queries |
| `"products"` | Product list queries |
| `"reports"` | Dashboard summary, outstanding, stock reports |

Reports are also busted on invoice and product mutations since they aggregate that data.

---

## Rules — Do Not

- **Do not** write Prisma queries directly in route handlers. Add them to `src/lib/db.ts` as `unstable_cache` wrappers.
- **Do not** add `"use cache"` directive anywhere — it requires `cacheComponents: true` which triggers "Blocking Route Server" errors on navigation.
- **Do not** add `cacheComponents: true` to `next.config.ts` — confirmed to break this app.
- **Do not** use single-arg `revalidateTag(tag)` — deprecated in Next.js 16. Always use `revalidateTag(tag, { expire: 0 })`.
- **Do not** import from `src/lib/db.ts` or `src/lib/prisma.ts` in any client component — server-only modules.
- **Do not** create a mutation route handler (POST/PUT/DELETE) without calling `revalidateTag` — lists will show stale data.
- **Do not** change the invoice number format `SH-{YYYY}-{0001}` — it appears on printed invoices.
- **Do not** remove the `postinstall` script from package.json — it generates the Prisma client on Vercel.

---

## Database Models (summary)

- **User** — id, name, email, password (bcrypt), role (admin/staff)
- **Customer** — id, name, phone, email, address, city, state, pincode, gstin
- **Product** — id, name, sku, unit, price, gstRate, stock, minStock, categoryId, brandId
- **Category** / **Brand** — id, name (unique)
- **Invoice** — invoiceNumber (unique, `SH-YYYY-0001`), date, dueDate, customerId, userId, status (unpaid/partial/paid), subtotal, cgst, sgst, igst, total, paidAmount, isInterState
- **InvoiceItem** — invoiceId, productId, name, quantity, unit, price, gstRate, gstAmount, total
- **Payment** — invoiceId, amount, method, reference, date

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string. Use the **pooled** URL (`?pgbouncer=true&connection_limit=1`) in production. |
| `NEXTAUTH_SECRET` | Yes | Random secret min 32 chars. Generate: `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Production only | Full deployed URL e.g. `https://your-app.vercel.app`. Required by NextAuth v4. |

---

## Common Tasks

**Add a new cached query:**
1. Add an `unstable_cache` wrapper to `src/lib/db.ts`
2. Import and call it from the GET route handler
3. Add `revalidateTag` calls to any mutation handlers that affect that data

**Add a new page:**
1. Create `src/app/(dashboard)/<page>/page.tsx` with `"use client"` at top
2. Use `useFetch("/api/<resource>")` for data, call `mutate()` to refresh after writes

**Schema change:**
```bash
npx prisma migrate dev --name describe-change
npx prisma generate
```

**Seed database:**
```bash
npx tsx prisma/seed.ts
```

**First admin user (production):**
POST to `/api/setup` with `{ name, email, password }` — creates the first admin account. Delete or protect this route after first use.

---

# Folder Structure (full)

```
src/
  app/
    (dashboard)/
      layout.tsx          # "use client" — sidebar, topbar, auth guard
      page.tsx            # Dashboard KPI cards + recent invoices
      invoices/page.tsx, new/page.tsx, [id]/page.tsx, edit/[id]/page.tsx
      customers/page.tsx, new/page.tsx, [id]/page.tsx, edit/[id]/page.tsx
      products/page.tsx, new/page.tsx, edit/[id]/page.tsx
      brands/page.tsx
      payments/page.tsx
      reports/page.tsx
      admin/page.tsx       # Admin panel: profile, user management, activity log (paginated)
      bin/page.tsx         # Soft-deleted items (customers, products, invoices)
      settings/page.tsx    # Business settings + Gmail send-from credentials (independent edit)
    api/
      auth/
        [...nextauth]/
        forgot-password/route.ts   # POST — generate token, send reset email via Gmail
        reset-password/route.ts    # POST — validate token, update password
        find-email/route.ts        # POST — find masked email by name
      invoices/route.ts, [id]/route.ts, [id]/payment/route.ts
      customers/route.ts, [id]/route.ts
      products/route.ts, [id]/route.ts
      brands/route.ts, [id]/route.ts
      categories/route.ts
      payments/route.ts
      reports/route.ts
      setup/route.ts
      admin/
        users/route.ts, [id]/route.ts
        activity/route.ts
        profile/route.ts            # resolveSessionUser fallback for old JWTs
      bin/route.ts, [type]/[id]/route.ts
      send-invoice/route.ts         # reads Gmail creds from DB, falls back to env vars
      settings/route.ts
    forgot-password/page.tsx        # Enter email → receive reset link
    reset-password/page.tsx         # Enter new password via ?token= URL param
    find-email/page.tsx             # Search by name → see masked email
    login/page.tsx
  components/ui/
    Button.tsx, Input.tsx, Badge.tsx, Breadcrumb.tsx,
    ConfirmDialog.tsx, Skeleton.tsx, Spinner.tsx, Toast.tsx, PasswordInput.tsx
  lib/
    auth.ts, db.ts, prisma.ts, theme.tsx, useCache.ts,
    loading.tsx, activity.ts
  types/next-auth.d.ts
prisma/schema.prisma, seed.ts
```

---

# Database Schema (current)

- **User** — id, name, email, password (bcrypt), role (admin/staff), createdAt
- **ActivityLog** — id, userId, action, details, entityId?, entityType?, createdAt
- **PasswordResetToken** — id, userId, token (unique), expiresAt, usedAt?, createdAt
- **Customer** — id, name, phone?, email?, address?, city?, state?, pincode?, gstin?, deletedAt?
- **Category** — id, name (unique), deletedAt?
- **Brand** — id, name (unique), deletedAt?
- **Product** — id, name, description?, sku? (unique), unit, price, gstRate, stock, minStock, categoryId?, brandId?, deletedAt?
- **Invoice** — invoiceNumber (SH-YYYY-0001), date, dueDate?, customerId, userId, status (unpaid/partial/paid), subtotal, cgst, sgst, igst, total, paidAmount, notes?, isInterState, deletedAt?
- **InvoiceItem** — invoiceId, productId, name, quantity, unit, price, gstRate, gstAmount, total
- **Payment** — invoiceId, amount, method, reference?, date, notes?
- **BusinessSettings** — singleton row: id="singleton", name, tagline, email (contact/printed), phone, address, city, state, pincode, gstin, **gmailUser** (send-from), **gmailAppPassword**, updatedAt

> ⚠️ Three distinct email concepts: `User.email` = login email · `BusinessSettings.email` = printed on invoices · `BusinessSettings.gmailUser` = Gmail used to send emails

---

# API Routes (full list)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/invoices | List invoices / create invoice |
| GET/PUT/DELETE | /api/invoices/[id] | Get/edit/soft-delete invoice |
| POST | /api/invoices/[id]/payment | Record payment |
| GET/POST | /api/customers | List / create customer |
| GET/PUT/DELETE | /api/customers/[id] | Get/edit/soft-delete customer |
| GET/POST | /api/products | List / create product |
| GET/PUT/DELETE | /api/products/[id] | Get/edit/soft-delete product |
| GET/POST | /api/brands | List / create brand |
| DELETE | /api/brands/[id] | Delete brand |
| GET/POST | /api/categories | List / create category |
| GET | /api/payments | All payments |
| GET | /api/reports | ?type=summary\|outstanding\|stock |
| POST | /api/setup | Seed first admin user |
| GET/POST | /api/admin/users | List users / create user (admin) |
| GET/PUT/DELETE | /api/admin/users/[id] | Manage user (admin) |
| GET | /api/admin/activity | Activity log (?limit&offset&userId) |
| GET/PUT | /api/admin/profile | Get/update own profile/password |
| GET | /api/bin | List soft-deleted items |
| POST/DELETE | /api/bin/[type]/[id] | Restore / permanent-delete item |
| POST | /api/send-invoice | Send invoice PDF via Gmail (creds from DB, fallback env) |
| GET/PUT | /api/settings | Get / update business settings incl. Gmail creds |
| POST | /api/auth/forgot-password | Generate reset token, send email (1-hr expiry) |
| POST | /api/auth/reset-password | Validate token, update password, mark token used |
| POST | /api/auth/find-email | Search users by name, return masked emails |

---

# Features Completed

1. **Invoice management** — Create, list, view, edit, soft-delete; auto-number `SH-YYYY-0001`; GST (intra/inter-state CGST+SGST / IGST); PDF generation; payment recording; status auto-update (unpaid/partial/paid)
2. **Customer management** — Full CRUD with soft-delete; invoice history per customer
3. **Product management** — Full CRUD with soft-delete; stock tracking; min-stock alerts; category/brand relations
4. **Brand & Category CRUD** — With soft-delete
5. **Payments** — Record payments against invoices; full payment history page
6. **Reports** — Summary dashboard, outstanding invoices, low-stock report
7. **Admin panel** — User management (create/edit/delete staff+admin); activity log with user/text filter and page-based pagination (20/page); login-email badge on profile view
8. **Activity logging** — Every mutation logs to `ActivityLog` via `src/lib/activity.ts`; full detail logging
9. **Bin (Recycle Bin)** — View soft-deleted customers, products, invoices; restore or permanently delete
10. **Business Settings** — Singleton `BusinessSettings` row; editable name, tagline, contact email, phone, address, GSTIN; Gmail send-from section has independent edit/clear flow with status dot
11. **Email invoice** — `/api/send-invoice` reads Gmail creds from `BusinessSettings` (falls back to env vars); returns 503 with clear message if not configured
12. **Auth** — NextAuth v4 credentials + JWT; role-based (admin/staff); JWT callback syncs name/email/role on `updateSession`; `resolveSessionUser` fallback in profile API handles old JWTs without `id`
13. **Forgot password** — `/forgot-password` → email → reset link (1-hr token) → `/reset-password?token=` → new password; token single-use, stored in `PasswordResetToken` table
14. **Find email** — `/find-email` page: search by name → see masked email (`gy***@domain.com`) → link to forgot-password
15. **Theme** — Light/dark toggle via CSS variables + localStorage
16. **Common Loader** — Shared full-screen loading UI component

---

# Current Work In Progress

Nothing actively in progress — all recent features complete and deployed.

---

# Pending Tasks

- Verify email send flow end-to-end: Settings → configure Gmail → invoice detail → send button → customer inbox
- Test forgot-password full flow in production (requires `NEXTAUTH_URL` set correctly on Vercel)
- Test bin restore/permanent-delete for all entity types

---

# Known Issues

- Theme flicker on initial load (light/dark flash) — known, not yet fixed
- After schema changes (`prisma db push`), must stop dev server → `npx prisma generate` → restart. The DLL file lock prevents generate while server is running.

---

# Deployment Notes

- Hosted on Vercel
- `postinstall` in package.json runs `prisma generate` — do NOT remove
- Use pooled Neon URL with `?pgbouncer=true&connection_limit=1`
- `NEXTAUTH_URL` required in production env vars on Vercel

---

# Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string |
| `NEXTAUTH_SECRET` | Yes | Min 32 chars random secret |
| `NEXTAUTH_URL` | Production | Full deployed URL |
| `GMAIL_USER` | Yes (email) | Gmail address for sending invoices |
| `GMAIL_APP_PASSWORD` | Yes (email) | Gmail App Password (not account password) |

---

# Important Decisions

- All pages `"use client"` — no async server components; data fetched via `useFetch` hook
- `unstable_cache` used for server-side caching; `revalidateTag(tag, { expire: 0 })` on every mutation
- `"use cache"` directive forbidden — causes "Blocking Route Server" errors
- `cacheComponents: true` forbidden in next.config — confirmed to break this app
- Single-arg `revalidateTag(tag)` deprecated in Next.js 16 — always use two-arg form
- Soft-delete pattern (`deletedAt` field) used for customers, products, brands, categories, invoices
- BusinessSettings stored as singleton row with id="singleton"
- Activity logging never throws — wrapped in try/catch so it never breaks main operations

---

# Next Actions

1. Verify Settings page appears in sidebar nav (`src/app/(dashboard)/layout.tsx`)
2. Verify send-invoice button exists on invoice detail page and wires to `/api/send-invoice`
3. Confirm `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in Vercel env vars
4. Test full email flow end-to-end in production
5. Run `npx prisma migrate dev` if `BusinessSettings` model migration hasn't been applied yet
