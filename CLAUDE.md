@AGENTS.md

<!-- AUTO-MAINTAINED PROJECT CONTINUITY DOCUMENT — updated 2026-07-10 -->

# Project Overview

Science Hub is a GST billing and inventory management web app for a science supplies business. It handles invoice creation with auto-numbering, customer management, product/stock tracking, payment recording, PDF generation, email delivery of invoices, purchases (vendors, purchase bills, payments), a stock movement ledger, a recycle bin, global search, and admin/staff role management with activity logging.

---

# Tech Stack

- **Framework**: Next.js 16 App Router (all pages `"use client"`, no async server components)
- **Database**: PostgreSQL on Neon via Prisma ORM
- **Auth**: NextAuth v4 (CredentialsProvider + JWT sessions)
- **Email**: Nodemailer with Gmail SMTP (App Password)
- **PDF**: Client-side PDF generation (`src/lib/generateInvoicePdf.ts`), supports Original/Duplicate multi-copy stamping via `PdfCopyDialog`, sent via `/api/send-invoice`
- **File storage**: Vercel Blob (purchase bill attachments)
- **Styling**: CSS Modules + CSS variables (light/dark theme via localStorage)
- **Frontend Deployment**: Vercel
- **Database Deployment**: Neon

---

## Project Structure (full)

```
src/
  app/
    (dashboard)/
      layout.tsx                       # thin wrapper — just renders <DashboardShell>
      dashboard/page.tsx                # KPI cards + recent invoices
      admin/page.tsx                    # Profile, user management, activity log (paginated)
      bin/page.tsx                      # Recycle bin — 7 entity types, restore/permanent-delete/empty-all
      settings/page.tsx                 # Business settings, bank details (IFSC autofill), Gmail send-from
      products/
        page.tsx, new/page.tsx, [id]/page.tsx, edit/[id]/page.tsx
      brands/
        page.tsx, [id]/page.tsx
      categories/
        page.tsx, [id]/page.tsx
      sales/
        page.tsx                        # Sales overview/dashboard
        customers/  page.tsx, new/page.tsx, [id]/page.tsx, edit/[id]/page.tsx
        invoices/   page.tsx, new/page.tsx, [id]/page.tsx, edit/[id]/page.tsx
        payments/page.tsx                # Payments Received
      purchases/
        page.tsx                        # Purchase overview/dashboard
        vendors/   page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
        bills/     page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
        payments/page.tsx                # Payments Made
      reports/
        sales/page.tsx
        purchases/page.tsx
    api/
      auth/
        [...nextauth]/route.ts
        find-email/route.ts             # POST — masked email lookup by name, rate-limited
        forgot-password/route.ts        # POST — 1-hr reset token + email, always {ok:true}, rate-limited
        reset-password/route.ts         # POST — validate token, set password, rate-limited
      admin/
        users/route.ts, [id]/route.ts
        activity/route.ts, [id]/route.ts   # GET list (admin), DELETE single entry (admin)
        profile/route.ts                # resolveSessionUser fallback for old JWTs
      bin/
        route.ts                        # GET — auto-purges 30-day-old bin items, then lists remaining
        [type]/[id]/route.ts             # POST restore / DELETE permanent (admin)
        empty/route.ts                   # DELETE — admin bulk-purge of every bin item at once
      brands/route.ts, [id]/route.ts
      categories/route.ts, [id]/route.ts
      customers/route.ts, [id]/route.ts
      products/route.ts, [id]/route.ts
      vendors/route.ts, [id]/route.ts
      invoices/
        route.ts                        # GET list / POST create (SH-YYYY-0001)
        [id]/route.ts                   # GET/PUT/DELETE
        [id]/payment/route.ts, [id]/payment/[paymentId]/route.ts
        [id]/returns/route.ts           # GET/POST — returns capped by paid amount
      purchase-bills/
        route.ts                        # GET list / POST create (PB-YYYY-0001)
        [id]/route.ts                   # GET/PUT/DELETE
        [id]/payment/route.ts
        payments/route.ts               # GET — all purchase payments
        upload/route.ts                 # POST/DELETE — Vercel Blob attachment (magic-byte validated)
      payments/route.ts                 # GET — all sales payments
      reports/route.ts                  # GET ?type=summary|outstanding|stock|sales-dashboard|purchase-dashboard|combined-dashboard|gst-summary
      purchase-reports/route.ts         # GET ?type=summary|outstanding|category|stock-ledger
      search/route.ts                   # GET ?q= — global search, 7 entity types
      settings/
        route.ts                        # GET/PUT — business settings incl. bank details, Gmail creds
        ifsc-lookup/[code]/route.ts     # GET — admin-only proxy to Razorpay IFSC directory
      send-invoice/route.ts             # POST — email invoice PDF, rate-limited
      setup/route.ts                    # POST — seed first admin (disabled in production once a user exists)
    layout.tsx                          # Root server layout — fonts, Providers
    providers.tsx                       # "use client" — SessionProvider + ThemeProvider
    login/page.tsx
    forgot-password/page.tsx, reset-password/page.tsx, find-email/page.tsx
  components/
    layout/    DashboardShell.tsx (sidebar/topbar/auth-guard — the real shell), Breadcrumb.tsx, GlobalSearch.tsx
    dialogs/   ConfirmDialog.tsx, PdfCopyDialog.tsx (multi-copy PDF stamping)
    ui/        Button, Input, Badge, Skeleton, Spinner, Toast, PasswordInput, Pagination, PdfPreviewModal, Table
  lib/
    auth.ts               # NextAuth config (CredentialsProvider, JWT), constant-time dummy hash, rate-limited
    apiAuth.ts             # requireSession() / requireAdmin() route guards
    db.ts                  # Plain Prisma helpers for the original invoices/customers/products/reports routes; most newer routes query Prisma directly instead
    prisma.ts              # Prisma client singleton
    crypto.ts              # AES-256-GCM encrypt/decrypt for secrets-at-rest (Gmail app password, bank account number)
    activity.ts            # logActivity() — never throws
    stockMovement.ts       # recordStockMovement(tx, input) — writes one StockMovement ledger row inside a tx
    invoiceReturns.ts      # assertInvoiceQuantitiesNotBelowReturned() guard
    blobStorage.ts         # Vercel Blob helpers; isPurchaseBillBlobUrl() allowlists the app's own blob path
    html.ts                # escapeHtml() for email bodies
    validation.ts          # Shared client+server validators: rules.*, validate(), plus per-entity validateXInput()
    rateLimit.ts           # In-memory fixed-window limiter + getClientIp()
    numberToWords.ts       # Rupee amount → English words for printed invoices
    generateInvoicePdf.ts  # Client-side PDF blob generator (multi-copy support)
    states.ts              # INDIA_STATES list
    theme.tsx              # ThemeContext — light/dark via localStorage
    loading.tsx            # Full-screen loading component
    useCache.ts            # useFetch(url) — shared in-memory cache, subscriber map, mutate()/bustCache()
    useDirty.ts            # useDirty(values) — tracks form dirty state for Save button gating
  types/next-auth.d.ts
prisma/schema.prisma, seed.ts
```

**Note on routing**: pages were reorganized under `sales/` and `purchases/` groups (invoices/customers/payments → `sales/*`; vendors/bills/payments → `purchases/*`), but the **API routes were not renamed** — `/api/invoices`, `/api/customers`, `/api/payments`, `/api/vendors`, `/api/purchase-bills` all stay at their original top-level paths. Only the UI routing changed.

**Sidebar nav groups** (`NAV_GROUPS` in `DashboardShell.tsx`): Dashboard · SALES (Overview, Customers, Invoices, Payments Received) · PURCHASES (Overview, Vendors, Purchase Bills, Payments Made) · CATALOG (Products, Brands, Categories) · REPORTS (Sales Reports, Purchase Reports) · SYSTEM (Admin, Settings — admin-only) · Recycle Bin (standalone).

---

## Key Files — Read Before Editing

| File | Why it matters |
|------|----------------|
| `src/lib/db.ts` | Holds plain Prisma helpers for the original invoices/customers/products/reports routes. Most newer routes (vendors, purchase-bills, search, etc.) write Prisma queries directly in the handler instead — match whichever pattern the file you're editing already uses. |
| `src/lib/useCache.ts` | Client fetch + cache hook. `useFetch(url)` returns `{ data, loading, mutate }`. Call `mutate()` after mutations. `bustCache(url)` for one-off busting. Throws on non-2xx JSON instead of silently returning the error body as data. |
| `src/lib/auth.ts` | NextAuth config. `NEXTAUTH_SECRET` must be a real secret in production. |
| `src/lib/validation.ts` | Shared `rules.*` validators (gstin, pan, ifsc, phone, etc.) and per-entity `validateXInput()` server-side validators — reuse these rather than writing new inline validation. |
| `src/lib/stockMovement.ts` | Every stock-affecting mutation (invoice create/edit/delete, purchase bill create/edit/delete, returns, bin restore) must call `recordStockMovement()` inside the same Prisma transaction. |
| `src/lib/crypto.ts` | Gmail app password and bank account number are encrypted at rest via this module. Passes through legacy unprefixed plaintext values. |
| `prisma/schema.prisma` | Source of truth for the data model. Run `npx prisma migrate dev` after schema changes. |
| `src/app/api/invoices/route.ts` | Invoice number format is `SH-{YEAR}-{0001}`, generated inside a Serializable transaction with retry-on-conflict. Don't break the sequence logic. |
| `src/app/api/purchase-bills/route.ts` | Same auto-number pattern for `PB-{YEAR}-{0001}`. |
| `src/components/layout/DashboardShell.tsx` | The actual sidebar/topbar/auth-guard shell (not the route group's `layout.tsx`, which is just a wrapper). Nav structure and `GlobalSearch` mounting live here. |

---

## Data Flow

All pages are `"use client"`. There are no async server components that fetch data.

```
Browser → useFetch("/api/...") → API Route Handler → Prisma → Neon DB
```

- **Reads**: `useFetch` hits API route → route handler queries Prisma directly (or via a `src/lib/db.ts` helper for the older routes) → client caches the response in-memory for 2 min (`src/lib/useCache.ts`)
- **Writes**: POST/PUT/DELETE route handler mutates DB, then calls `revalidateTag(tag, { expire: 0 })` (kept for convention/future use with Next's data cache) and the client calls `mutate()`/`bustCache()` to refresh its own in-memory cache — the client-side cache is what actually keeps lists in sync today, since no route currently uses `fetch()`-based or `unstable_cache` server caching for `revalidateTag` to invalidate.

---

## Cache Tags

`revalidateTag(tag, { expire: 0 })` must be called after every mutation. Tags: `"invoices"`, `"customers"`, `"products"`, `"vendors"`, `"purchase-bills"`, `"reports"`. Reports are also busted on invoice/product/purchase-bill mutations since they aggregate that data.

---

## Rules — Do Not

- Writing Prisma queries directly in route handlers is the established pattern for most routes — `src/lib/db.ts` only holds helpers for the original invoices/customers/products/reports list routes. Match the existing pattern for the file you're editing.
- **Do not** add `"use cache"` directive anywhere — it requires `cacheComponents: true` which triggers "Blocking Route Server" errors on navigation.
- **Do not** add `cacheComponents: true` to `next.config.ts` — confirmed to break this app.
- **Do not** use single-arg `revalidateTag(tag)` — deprecated in Next.js 16. Always use `revalidateTag(tag, { expire: 0 })`.
- **Do not** import from `src/lib/db.ts` or `src/lib/prisma.ts` in any client component — server-only modules.
- **Do not** create a mutation route handler (POST/PUT/DELETE) without calling `revalidateTag` — lists will show stale data.
- **Do not** change the invoice number format `SH-{YYYY}-{0001}` — it appears on printed invoices.
- **Do not** remove the `postinstall` script from package.json — it generates the Prisma client on Vercel.
- **Do not** mutate stock without going through `recordStockMovement()` in the same transaction — the ledger must stay authoritative.
- **Do not** accept or delete arbitrary blob URLs for purchase-bill attachments — always go through `isPurchaseBillBlobUrl()` / `deleteAttachmentBlob()` in `blobStorage.ts`.

---

## Database Models (current)

- **User** — id, name, email(unique), password(bcrypt), role(admin/staff), tokenVersion(Int), createdAt → invoices[], activityLogs[], resetTokens[], purchaseBillsCreated[], stockMovementsCreated[]
- **PasswordResetToken** — id, userId, token(unique), expiresAt, usedAt?, createdAt
- **ActivityLog** — id, userId, action, details, entityId?, entityType?, createdAt (indexes: userId, createdAt)
- **Customer** — id, name, phone?, email?, address?, city?, state?, pincode?, gstin?, deletedAt?
- **Category** — id, name(unique), deletedAt?
- **Brand** — id, name(unique), deletedAt?
- **Product** — id, name, description?, sku?(unique), barcode?, hsn?, unit(default "Nos"), price, purchasePrice?, gstRate(default 18), stock, minStock(default 5), maxStock?, reorderLevel?, categoryId?, brandId?, isActive(default true), deletedAt?
- **Invoice** — invoiceNumber(unique, `SH-YYYY-0001`), date, dueDate?, customerId, userId, status(unpaid/partial/paid), subtotal, cgst, sgst, igst, total, paidAmount, notes?, isInterState, **placeOfSupply** String?, **reverseCharge** Boolean(default false), deletedAt?
- **InvoiceItem** — invoiceId, productId, name, hsn(default ""), quantity, unit, price, discountPercent(default 0), discountAmount(default 0), gstRate, gstAmount, total
- **Payment** — invoiceId, amount, method(default "cash"), reference?, date, notes?
- **Return** / **ReturnItem** — invoice returns; restores stock, capped by the invoice's paid amount
- **BusinessSettings** — singleton row `id="singleton"`: name, tagline, email(printed), phone, address, city, state, pincode, gstin, **pan**, gmailUser, gmailAppPassword(encrypted), **bankName, bankAccountName, bankAccountNumber**(encrypted)**, bankIfsc, bankBranch**, **termsAndConditions**, updatedAt
- **Vendor** — id, name, company?, gstin?, phone?, email?, address?, notes?, isActive(default true), deletedAt?
- **PurchaseBill** — billNumber(unique, `PB-YYYY-0001`), vendorId, billDate, dueDate?, subtotal, taxAmount, discount, total, paidAmount, status(unpaid/partial/paid/cancelled), notes?, attachmentUrl?/attachmentName?(Vercel Blob), category?, createdByUserId, deletedAt? (indexes: vendorId, status, billDate)
- **PurchaseBillItem** — purchaseBillId, productId?, name, quantity, unit(default "Nos"), purchasePrice, gstRate(default 0), gstAmount(default 0), total
- **PurchasePayment** — purchaseBillId, amount, method(default "cash"), reference?, date, notes? (index: purchaseBillId)
- **StockMovement** — productId?(nullable, `onDelete: SetNull`), **productName**(snapshot, default ""), type(purchase/sale/adjustment/return), quantity(signed), balanceAfter, reference?, notes?, purchaseBillId?, createdByUserId?, createdAt (indexes: productId, createdAt)

> ⚠️ Three distinct email concepts: `User.email` = login email · `BusinessSettings.email` = printed on invoices · `BusinessSettings.gmailUser` = Gmail used to send emails

---

## API Routes (full list)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/invoices` | List invoices (`?status`, `?customerId`) / create invoice — auto-numbers `SH-YYYY-0001`, requires `placeOfSupply`, optional inline customer creation, decrements stock + records `StockMovement` |
| GET/PUT/DELETE | `/api/invoices/[id]` | Get / full edit (reverses+reapplies stock, re-validates returned-qty floor) / soft-delete (restores stock, double-delete safe) |
| GET/POST | `/api/invoices/[id]/returns` | List returns for an invoice / create a return — validated against paid amount and remaining returnable qty inside a Serializable tx; restores stock |
| POST | `/api/invoices/[id]/payment` | Record a payment, recompute `paidAmount`/status |
| PUT | `/api/invoices/[id]/payment/[paymentId]` | Edit an existing payment, recompute invoice status |
| GET/POST | `/api/customers` | List customers (with `createdBy`) / create customer |
| GET/PUT/DELETE | `/api/customers/[id]` | Get / edit (blocked if in bin) / soft-delete (blocked if active invoices exist) |
| GET/POST | `/api/products` | List (`?search`) with `createdBy` / create product |
| GET/PUT/DELETE | `/api/products/[id]` | Get (incl. last 15 stock movements) / edit / soft-delete (blocked if used in invoice line items) |
| GET/POST | `/api/brands` | List (product counts, `createdBy`) / create brand |
| GET/DELETE | `/api/brands/[id]` | Detail (assigned products) / soft-delete (blocked if products assigned or used in invoices) |
| GET/POST | `/api/categories` | List (product counts) / create category |
| GET/PUT/DELETE | `/api/categories/[id]` | Detail / rename / soft-delete (same blocking rules as brands) |
| GET/POST | `/api/vendors` | List (active bill counts) / create vendor (requires phone+address) |
| GET/PUT/DELETE | `/api/vendors/[id]` | Detail (purchase bills) / edit / soft-delete (blocked if active bills exist) |
| GET/POST | `/api/purchase-bills` | List (`?status`, `?vendorId`) / create — auto-numbers `PB-YYYY-0001`, server recomputes GST/totals, increments stock, optional inline payment |
| GET/PUT/DELETE | `/api/purchase-bills/[id]` | Get / edit (reverses+reapplies stock; handles cancel/un-cancel; blocks item edits on paid/cancelled bills) / soft-delete (reverses stock, double-delete safe) |
| POST | `/api/purchase-bills/[id]/payment` | Record a payment, recompute status |
| GET | `/api/purchase-bills/payments` | All purchase payments |
| POST/DELETE | `/api/purchase-bills/upload` | Upload attachment to Vercel Blob (size/MIME/magic-byte validated) / delete an orphaned never-attached upload |
| GET | `/api/purchase-reports` | `?type=summary\|outstanding\|category\|stock-ledger` |
| GET | `/api/reports` | `?type=summary\|outstanding\|stock\|sales-dashboard\|purchase-dashboard\|combined-dashboard\|gst-summary` |
| GET | `/api/payments` | All sales payments |
| GET | `/api/search` | Global search (`?q=`) across invoices/customers/products/vendors/purchase bills/brands/categories, 5 results per group |
| GET | `/api/bin` | Auto-purges bin items older than 30 days, then lists remaining across 7 entity types with `daysLeft`/`deletedBy`/`protectedReason` |
| POST/DELETE | `/api/bin/[type]/[id]` | Restore (re-applies stock, double-restore safe) / permanent-delete (admin-only, per-type FK checks, blob cleanup) |
| DELETE | `/api/bin/empty` | Admin-only bulk-purge of every bin item at once |
| GET/PUT | `/api/settings` | Get (non-admins don't see `gmailUser`) / update business settings incl. bank details, Gmail creds (encrypted at rest) |
| GET | `/api/settings/ifsc-lookup/[code]` | Admin-only proxy to Razorpay's public IFSC directory (server-side, 5s timeout) |
| GET/POST | `/api/admin/users` | List users (invoice counts) / create user |
| GET/PUT/DELETE | `/api/admin/users/[id]` | Manage a single user (admin) |
| GET | `/api/admin/activity` | Activity log (`?userId`, `?limit` max 500, `?offset`) — admin only |
| DELETE | `/api/admin/activity/[id]` | Delete a single activity log entry — admin only |
| GET/PUT | `/api/admin/profile` | Get/update own profile+password; `resolveSessionUser` fallback for old JWTs missing `id` |
| POST | `/api/send-invoice` | Send invoice PDF via Gmail SMTP; rate-limited (20/15min per user); creds from `BusinessSettings` with env fallback |
| POST | `/api/setup` | Seed first admin user; hard-disabled in production once any user exists |
| POST | `/api/auth/find-email` | Search users by name, return masked email; rate-limited |
| POST | `/api/auth/forgot-password` | Generate 1-hr reset token, send email; always `{ok:true}` (anti-enumeration); rate-limited |
| POST | `/api/auth/reset-password` | Validate token, update password, mark token used; rate-limited |
| * | `/api/auth/[...nextauth]` | NextAuth handler |

---

## Global Search

`GET /api/search?q=` (session required) runs 7 parallel `deletedAt: null` Prisma queries (5 results each) across invoices, customers, products, vendors, purchase bills, brands, categories. UI is `src/components/layout/GlobalSearch.tsx`, debounced 250ms with `AbortController` cancellation, mounted in `DashboardShell`'s topbar. Empty groups are dropped from the response.

## Recycle Bin

`src/app/(dashboard)/bin/page.tsx` covers 7 entity types (invoices, purchase bills, customers, products, brands, categories, vendors). `GET /api/bin` auto-purges anything older than 30 days on every load, and annotates remaining items with why they can't yet be permanently deleted (`protectedReason` — e.g. a customer still referenced by an active invoice). `DELETE /api/bin/empty` (admin-only) purges everything at once in FK-safe order (invoices/purchase-bills first, then customers/products, then brands/categories, then vendors).

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string (`?pgbouncer=true&connection_limit=1` in production) |
| `NEXTAUTH_SECRET` | Yes | Min 32 chars random secret. Also used to derive the key for `src/lib/crypto.ts` (Gmail app password / bank account number encryption). |
| `NEXTAUTH_URL` | Production | Full deployed URL, e.g. `https://your-app.vercel.app` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | For email sending | Gmail address + App Password, used as fallback when `BusinessSettings.gmailUser`/`gmailAppPassword` aren't set |
| `BLOB_READ_WRITE_TOKEN` | For purchase bill attachments | Vercel Blob token — auto-set on Vercel, pull locally with `vercel env pull`. Without it, attachment upload fails but everything else works. |

---

## Common Tasks

**Add a new query:**
1. Write the Prisma query directly in the GET route handler (the prevailing pattern), or add a plain helper to `src/lib/db.ts` if it belongs alongside the existing invoices/customers/products/reports helpers
2. Add `revalidateTag(tag, { expire: 0 })` calls to any mutation handlers that affect that data

**Add a new page:**
1. Create `src/app/(dashboard)/<page>/page.tsx` with `"use client"` at top
2. Use `useFetch("/api/<resource>")` for data, call `mutate()` to refresh after writes
3. If it belongs in the sidebar, add an entry to `NAV_GROUPS` in `src/components/layout/DashboardShell.tsx`

**Add a stock-affecting mutation:**
Wrap the Prisma writes in a transaction and call `recordStockMovement(tx, { productId, type, quantity, ... })` from `src/lib/stockMovement.ts` for every stock change, so the ledger stays accurate.

**Schema change:**
```bash
npx prisma migrate dev --name describe-change
npx prisma generate
```
Stop the dev server first — the generated client DLL is locked while the server is running.

**Seed database:**
```bash
npx tsx prisma/seed.ts
```

**First admin user (production):**
POST to `/api/setup` with `{ name, email, password }`. Refuses if any user already exists.

---

## Important Decisions

- All pages `"use client"` — no async server components; data fetched via `useFetch` hook
- No server-side data caching is actually in use (`unstable_cache` isn't called anywhere) — freshness comes entirely from `src/lib/useCache.ts`'s client-side 2-min TTL plus `mutate()`/`bustCache()` after writes. `revalidateTag(tag, { expire: 0 })` is still called on every mutation for consistency and in case server caching is added later.
- `"use cache"` directive forbidden — causes "Blocking Route Server" errors
- `cacheComponents: true` forbidden in next.config — confirmed to break this app
- Single-arg `revalidateTag(tag)` deprecated in Next.js 16 — always use two-arg form
- Soft-delete pattern (`deletedAt`) used for customers, products, brands, categories, invoices, vendors, purchase bills
- BusinessSettings stored as singleton row with `id="singleton"`
- Activity logging never throws — wrapped in try/catch so it never breaks main operations
- Invoice/purchase-bill number generation runs inside Serializable transactions with retry-on-conflict (`P2034`) to prevent duplicate numbers under concurrent requests
- Secrets at rest (Gmail app password, bank account number) are AES-256-GCM encrypted via `src/lib/crypto.ts`, keyed off `NEXTAUTH_SECRET`; legacy unprefixed plaintext values still pass through
- Purchase-bill attachment uploads validate magic bytes, not just declared MIME type; accepted/deletable blob URLs are allowlisted to the app's own storage path (`blobStorage.ts`)
- UI routing (`sales/*`, `purchases/*`) was reorganized independently of the API surface — API paths stayed at their original top-level routes

---

## Features Completed

1. **Invoice management** — Create, list, view, edit, soft-delete; auto-number `SH-YYYY-0001`; GST (intra/inter-state CGST+SGST / IGST); place-of-supply (required) and reverse-charge fields; per-line HSN and discount (percent/amount); PDF generation with Original/Duplicate multi-copy stamping; payment recording; status auto-update (unpaid/partial/paid); double-delete/double-restore safe
2. **Invoice returns** — Return line items against an invoice, capped by remaining returnable quantity and the invoice's paid amount; restores stock
3. **Customer management** — Full CRUD with soft-delete; invoice history per customer; detail page
4. **Product management** — Full CRUD with soft-delete; barcode/HSN/purchasePrice/maxStock/reorderLevel/isActive fields; stock tracking; min-stock alerts; category/brand relations; detail page shows last 15 stock movements
5. **Brand & Category CRUD** — With soft-delete and detail pages listing assigned products
6. **Payments** — Record payments against invoices; edit existing payments; full payment history pages (Sales and Purchases, separately)
7. **Reports** — Sales reports and Purchase reports pages; summary/outstanding/stock/GST-summary/combined-dashboard endpoints
8. **Admin panel** — User management (create/edit/delete staff+admin); activity log with user/text filter, page-based pagination, and per-entry delete; login-email badge on profile view
9. **Activity logging** — Every mutation logs to `ActivityLog` via `src/lib/activity.ts`; never throws
10. **Bin (Recycle Bin)** — 7 entity types; 30-day auto-purge; restore or permanent-delete; admin-only "empty bin" bulk purge with FK-safe ordering; `protectedReason` shown when an item can't yet be purged
11. **Business Settings** — Singleton row; name/tagline/contact/GSTIN/PAN; bank details (name, account name/number, IFSC with autofill lookup, branch) encrypted at rest; terms & conditions text; Gmail send-from with independent edit/clear flow
12. **Email invoice** — `/api/send-invoice` reads Gmail creds from `BusinessSettings` (falls back to env vars); rate-limited; returns 503 with clear message if not configured
13. **Auth** — NextAuth v4 credentials + JWT; role-based (admin/staff); constant-time login check (dummy hash) to resist user enumeration; rate-limited login/reset endpoints
14. **Forgot password** — `/forgot-password` → email → reset link (1-hr token) → `/reset-password?token=` → new password; single-use token
15. **Find email** — `/find-email` page: search by name → masked email → link to forgot-password
16. **Theme** — Light/dark toggle via CSS variables + localStorage
17. **Purchases (vendors & purchase bills)** — Vendor CRUD with soft-delete and detail page; purchase bill creation (auto-number `PB-YYYY-0001`) with inline vendor creation, stock increment on create/reversal on delete/restore, cancel/un-cancel handling, payment recording, PDF download, optional attachment (image/PDF up to 10 MB, Vercel Blob, magic-byte validated, orphan/replace cleanup)
18. **Stock movement ledger** — `StockMovement` rows for every stock change (purchase, sale, adjustment, return), nullable `productId` with a name snapshot so history survives product deletion, running balance, tied to the invoice/purchase bill that caused it
19. **Global search** — Cross-entity search (invoices, customers, products, vendors, purchase bills, brands, categories) from the topbar, debounced with request cancellation
20. **Sidebar reorganization** — Nav grouped into Sales / Purchases / Catalog / Reports / System; pages moved under `sales/` and `purchases/` route segments (API paths unchanged)

---

## Current Work In Progress

Nothing actively in progress — all recent features complete and deployed.

---

## Pending Tasks

- Verify email send flow end-to-end: Settings → configure Gmail → invoice detail → send button → customer inbox
- Test forgot-password full flow in production (requires `NEXTAUTH_URL` set correctly on Vercel)
- Test bin restore/permanent-delete and empty-bin for all 7 entity types

---

## Known Issues

- Theme flicker on initial load (light/dark flash) — known, not yet fixed
- `src/lib/states.ts` currently only lists `["Delhi", "Haryana", "Uttar Pradesh"]` — the full India state list is commented out in the file
- After schema changes (`prisma db push`/`migrate dev`), must stop dev server → `npx prisma generate` → restart. The generated client DLL is locked while the server is running.

---

## Deployment Notes

- Hosted on Vercel
- `postinstall` in package.json runs `prisma generate` — do NOT remove
- Use pooled Neon URL with `?pgbouncer=true&connection_limit=1`
- `NEXTAUTH_URL` required in production env vars on Vercel
