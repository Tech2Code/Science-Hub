# Science Hub — Developer Structure Reference

> **Purpose:** Single source of truth for project architecture, conventions, and patterns.
> Read this before adding any new feature. Keep it updated when structure changes.
>
> **Corrected 2026-07-24**: several entries below were stale/incorrect and have been fixed in place
> (struck through where useful rather than silently deleted) after a full source-code audit. See
> `CLAUDE.md` for the currently-authoritative, more actively-maintained project overview — when the
> two disagree, trust `CLAUDE.md` and re-verify against the actual source, not this file.

---

## Tech Stack

| Layer | Tech | Version / Notes |
|-------|------|-----------------|
| Framework | Next.js App Router | v16 — all pages `"use client"`, no async server components |
| Database | PostgreSQL (Neon) | Pooled connection via pgbouncer |
| ORM | Prisma | Schema at `prisma/schema.prisma` |
| Auth | NextAuth v4 | CredentialsProvider + JWT; three roles — admin/staff/manager, plus per-user section permissions (see CLAUDE.md) |
| Email | Nodemailer + Gmail SMTP | App Password stored in BusinessSettings (encrypted at rest, `src/lib/crypto.ts`) |
| PDF | Client-side generation | Invoice detail page, sent via `/api/send-invoice` |
| ~~AI~~ | ~~Google Gemini 2.0 Flash bill extraction~~ | **Not present in the current codebase** — no `GOOGLE_API_KEY`, no extraction route, no AI-scan UI exist. This row was aspirational/stale; there is no AI feature in this app today. |
| Styling | CSS Modules + CSS variables | Light/dark theme via localStorage; a pre-hydration inline script in `src/app/layout.tsx` prevents theme flicker (an earlier note calling this "unfixed" was also stale) |
| Hosting | Vercel (frontend) + Neon (database) | ~~Railway~~ is not used anywhere in this project |
| Rate limiting | In-memory fixed-window counter | `src/lib/rateLimit.ts` — defense-in-depth only, not distributed across instances |
| Middleware | `middleware.ts` | Default-deny baseline for `/api/**` — see CLAUDE.md |

---

## Directory Structure

```
d:\nextApps\science-hub\
├── prisma/
│   ├── schema.prisma          ← Source of truth for all DB models
│   └── seed.ts                ← Seed script: npx tsx prisma/seed.ts
│
├── src/
│   ├── app/
│   │   ├── layout.tsx         ← Root server layout — fonts, SessionProvider, ThemeProvider
│   │   ├── providers.tsx      ← "use client" — SessionProvider + ThemeProvider
│   │   │
│   │   ├── (dashboard)/       ← Route group: all authenticated pages (no URL segment)
│   │   │   ├── layout.tsx     ← Sidebar + topbar + auth guard
│   │   │   ├── page.tsx       ← / Dashboard — KPI cards, quick actions, recent activity
│   │   │   │
│   │   │   ├── sales/
│   │   │   │   ├── page.tsx              ← /sales Overview
│   │   │   │   ├── customers/
│   │   │   │   │   ├── page.tsx          ← /sales/customers List
│   │   │   │   │   ├── new/page.tsx      ← /sales/customers/new
│   │   │   │   │   ├── [id]/page.tsx     ← /sales/customers/[id] Detail + invoice history
│   │   │   │   │   └── edit/[id]/page.tsx
│   │   │   │   ├── invoices/
│   │   │   │   │   ├── page.tsx          ← /sales/invoices List + status filter
│   │   │   │   │   ├── new/page.tsx      ← /sales/invoices/new Create
│   │   │   │   │   ├── [id]/page.tsx     ← /sales/invoices/[id] Detail + payment + PDF
│   │   │   │   │   └── edit/[id]/page.tsx
│   │   │   │   └── payments/page.tsx     ← /sales/payments Payments received history
│   │   │   │
│   │   │   ├── purchases/
│   │   │   │   ├── page.tsx              ← /purchases Overview
│   │   │   │   ├── vendors/
│   │   │   │   │   ├── page.tsx          ← /purchases/vendors List
│   │   │   │   │   ├── new/page.tsx      ← /purchases/vendors/new
│   │   │   │   │   ├── [id]/page.tsx     ← /purchases/vendors/[id] Detail + bill history
│   │   │   │   │   └── [id]/edit/page.tsx
│   │   │   │   ├── bills/
│   │   │   │   │   ├── page.tsx          ← /purchases/bills List
│   │   │   │   │   ├── new/page.tsx      ← /purchases/bills/new — with AI scan upload
│   │   │   │   │   ├── [id]/page.tsx     ← /purchases/bills/[id] Detail + payment
│   │   │   │   │   └── [id]/edit/page.tsx
│   │   │   │   └── payments/page.tsx     ← /purchases/payments Payments made history
│   │   │   │
│   │   │   ├── products/
│   │   │   │   ├── page.tsx              ← /products List + low-stock alerts
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── edit/[id]/page.tsx
│   │   │   │
│   │   │   ├── brands/page.tsx           ← /brands CRUD (inline add/delete)
│   │   │   ├── reports/
│   │   │   │   ├── sales/page.tsx        ← /reports/sales
│   │   │   │   └── purchases/page.tsx    ← /reports/purchases
│   │   │   ├── admin/page.tsx            ← /admin Users + activity log (admin only)
│   │   │   ├── bin/page.tsx              ← /bin Recycle bin — restore / permanent delete
│   │   │   └── settings/page.tsx         ← /settings Business settings + Gmail config
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts
│   │   │   │   ├── forgot-password/route.ts
│   │   │   │   ├── reset-password/route.ts
│   │   │   │   └── find-email/route.ts
│   │   │   ├── invoices/route.ts, [id]/route.ts, [id]/payment/route.ts, [id]/returns/route.ts
│   │   │   ├── customers/route.ts, [id]/route.ts
│   │   │   ├── products/route.ts, [id]/route.ts
│   │   │   ├── brands/route.ts, [id]/route.ts
│   │   │   ├── categories/route.ts
│   │   │   ├── payments/route.ts
│   │   │   ├── vendors/route.ts, [id]/route.ts
│   │   │   ├── purchase-bills/route.ts, [id]/route.ts, [id]/payment/route.ts, extract/route.ts
│   │   │   ├── purchase-bills/payments/route.ts
│   │   │   ├── purchase-reports/route.ts
│   │   │   ├── reports/route.ts
│   │   │   ├── admin/users/route.ts, [id]/route.ts
│   │   │   ├── admin/activity/route.ts
│   │   │   ├── admin/profile/route.ts
│   │   │   ├── bin/route.ts, [type]/[id]/route.ts
│   │   │   ├── send-invoice/route.ts
│   │   │   ├── settings/route.ts
│   │   │   └── setup/route.ts
│   │   │
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── find-email/page.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx       ← variant: primary | secondary | danger; size: sm | md; href for links
│   │   │   ├── Input.tsx        ← Input, Select, Textarea, FormField (label + error + required)
│   │   │   ├── Badge.tsx        ← StatusBadge (unpaid/partial/paid/cancelled), ColorBadge
│   │   │   ├── Toast.tsx        ← useToast() hook; toast({ type, title, message })
│   │   │   ├── Spinner.tsx      ← Spinner, OverlayLoader (full-screen overlay while saving)
│   │   │   ├── Skeleton.tsx     ← Skeleton blocks for loading states
│   │   │   ├── Table.tsx        ← Shared table base styles
│   │   │   ├── Pagination.tsx   ← Page-based pagination component
│   │   │   ├── PdfPreviewModal.tsx ← PDF preview modal for invoices
│   │   │   └── PasswordInput.tsx   ← Password field with show/hide toggle
│   │   ├── layout/
│   │   │   └── Breadcrumb.tsx   ← items: [{ label, href? }] — last item has no href
│   │   └── dialogs/
│   │       └── ConfirmDialog.tsx ← Confirmation modal for destructive actions
│   │
│   ├── lib/
│   │   ├── auth.ts         ← NextAuth config; CredentialsProvider + JWT callbacks
│   │   ├── db.ts           ← ALL server-side DB queries (unstable_cache wrappers)
│   │   ├── prisma.ts       ← Prisma client singleton
│   │   ├── theme.tsx       ← ThemeContext — useTheme() hook; toggle light/dark
│   │   ├── useCache.ts     ← useFetch(url) → { data, loading, mutate }; bustCache(url)
│   │   ├── activity.ts     ← logActivity(session, action, details, entityId?, entityType?)
│   │   ├── loading.tsx     ← Full-screen loading component
│   │   └── validation.ts   ← Form validation: rules, validateForm, hasErrors, FormErrors<T>
│   │
│   └── types/
│       └── next-auth.d.ts  ← Extends Session/JWT with id, role
│
├── CLAUDE.md               ← AI coding agent instructions (do not remove)
├── AGENTS.md               ← Next.js version-specific agent notes (do not remove)
├── STRUCTURE.md            ← This file — developer reference
└── package.json            ← postinstall runs prisma generate — DO NOT REMOVE
```

---

## Database Models (Complete Schema)

### Core Auth
```prisma
User          id, name, email (unique), password (bcrypt), role (admin|staff|manager), tokenVersion, createdAt
ActivityLog   id, userId, action, details, entityId?, entityType?, createdAt
PasswordResetToken  id, userId, token (unique), expiresAt, usedAt?, createdAt
SectionPermission   id, userId, section, enabled — one row per (user, section); see CLAUDE.md for the six section keys
```

### Sales
```prisma
Customer      id, name, phone?, email?, address?, city?, state?, pincode?, gstin?, deletedAt?
Invoice       id, invoiceNumber (SH-YYYY-0001 unique), date, dueDate?, customerId, userId,
              status (unpaid|partial|paid), subtotal, cgst, sgst, igst, total, paidAmount,
              notes?, isInterState, deletedAt?
InvoiceItem   id, invoiceId, productId, name, quantity, unit, price, gstRate, gstAmount, total
Payment       id, invoiceId, amount, method, reference?, date, notes?
Return        id, invoiceId, date, notes?
ReturnItem    id, returnId, productId?, name, quantity, price, total
```

### Purchases
```prisma
Vendor        id, name, company?, gstin?, phone?, email?, address?, notes?, isActive, deletedAt?
PurchaseBill  id, billNumber (unique), vendorId, billDate, dueDate?, subtotal, taxAmount,
              discount, total, paidAmount, status (unpaid|partial|paid|cancelled),
              notes?, category?, attachmentUrl?, attachmentName?, createdByUserId, deletedAt?
PurchaseBillItem  id, purchaseBillId, productId?, name, quantity, unit, purchasePrice, gstRate, gstAmount, total
PurchasePayment   id, purchaseBillId, amount, method, reference?, date, notes?
StockMovement     id, productId, type (purchase|sale|adjustment|return|manual), quantity,
                  balanceAfter, reference?, notes?, purchaseBillId?, createdByUserId?
```

### Catalog
```prisma
Category      id, name (unique), deletedAt?
Brand         id, name (unique), deletedAt?
Product       id, name, description?, sku? (unique), barcode?, hsn?, unit, price (sale price),
              purchasePrice?, gstRate, stock, minStock, maxStock?, reorderLevel?,
              categoryId?, brandId?, isActive, deletedAt?
```

### Settings
```prisma
BusinessSettings  id="singleton", name, tagline, email (printed on invoices),
                  phone, address, city, state, pincode, gstin,
                  gmailUser (send-from address), gmailAppPassword
```

> **Three distinct emails:** `User.email` = login · `BusinessSettings.email` = printed on invoices · `BusinessSettings.gmailUser` = Gmail SMTP sender

---

## API Reference

### Sales
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/invoices` | List (with filters) / create invoice |
| GET/PUT/DELETE | `/api/invoices/[id]` | Get / edit / soft-delete |
| POST | `/api/invoices/[id]/payment` | Record payment against invoice |
| DELETE | `/api/invoices/[id]/payment/[paymentId]` | Delete a payment |
| POST | `/api/invoices/[id]/returns` | Record a return |
| GET/POST | `/api/customers` | List / create |
| GET/PUT/DELETE | `/api/customers/[id]` | Get / edit / soft-delete |
| GET | `/api/payments` | All payments received |
| GET | `/api/reports` | `?type=summary\|outstanding\|stock\|combined-dashboard` |

### Purchases
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/vendors` | List / create |
| GET/PUT/DELETE | `/api/vendors/[id]` | Get / edit / soft-delete |
| GET/POST | `/api/purchase-bills` | List / create |
| GET/PUT/DELETE | `/api/purchase-bills/[id]` | Get / edit / soft-delete |
| POST | `/api/purchase-bills/[id]/payment` | Record payment against bill |
| GET | `/api/purchase-bills/payments` | All payments made |
| GET | `/api/purchase-reports` | Purchase reports (`summary`/`category` exclude cancelled bills) |
| POST | `/api/products/[id]/adjust-stock` | Manual stock correction, requires a reason, writes a `"manual"` ledger row |

### Catalog
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/products` | List (`?search=`) / create |
| GET/PUT/DELETE | `/api/products/[id]` | Get / edit / soft-delete |
| GET/POST | `/api/brands` | List / create |
| DELETE | `/api/brands/[id]` | Delete brand |
| GET/POST | `/api/categories` | List / create |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/admin/users` | List users / create user (admin only) |
| GET/PUT/DELETE | `/api/admin/users/[id]` | Manage user (admin only) |
| GET | `/api/admin/activity` | Activity log (`?limit&offset&userId`) |
| GET/PUT | `/api/admin/profile` | Get / update own profile + password |
| GET | `/api/bin` | List soft-deleted items |
| POST/DELETE | `/api/bin/[type]/[id]` | Restore / permanent-delete |
| POST | `/api/send-invoice` | Send invoice PDF via Gmail |
| GET/PUT | `/api/settings` | Get / update business settings |
| POST | `/api/setup` | Seed first admin (use once, then protect) |
| POST | `/api/auth/forgot-password` | Generate 1-hr reset token, send email |
| POST | `/api/auth/reset-password` | Validate token, update password |
| POST | `/api/auth/find-email` | Search users by name, return masked email |

---

## Sidebar Navigation

**Corrected**: defined in `src/components/layout/DashboardShell.tsx` as `NAV_GROUPS` — **not** `src/app/(dashboard)/layout.tsx`, which is just a 5-line pass-through rendering `<DashboardShell>{children}</DashboardShell>`. (`CLAUDE.md` already had this right.)

```
Groups:      null → SALES → PURCHASES → CATALOG → REPORTS → SYSTEM
Admin-only:  /admin, /settings
Section-gated: Sales/Purchase Overview, Payments Received/Made, Sales/Purchase Reports, GST Reports
               (require the matching ProtectedSection grant, or admin — see CLAUDE.md)
Exact-match: /, /sales, /purchases (these don't highlight for sub-pages)
```

**To add a new nav item:**
1. Add an SVG to `NavIcons` in `DashboardShell.tsx`
2. Add entry to the relevant group in `NAV_GROUPS`
3. If it's an overview/landing page that has sub-pages, add its href to `EXACT_MATCH_HREFS`
4. If it should be gated by role or section, set `adminOnly` and/or `sectionRequired`/`sectionsRequired` on the entry

---

## Data Flow

```
Browser
  └── useFetch("/api/...") ──────────────────────────────────────► API Route Handler
                                                                         │
                                                                    unstable_cache
                                                                         │
                                                                    Prisma → Neon DB

After mutation (POST/PUT/DELETE):
  API Route ──► revalidateTag(tag, { expire: 0 })   ← server-side cache bust
  Client   ──► mutate() or bustCache(url)            ← client-side cache bust
```

### Cache Tags
| Tag | When to revalidate |
|-----|--------------------|
| `"invoices"` | Invoice create/edit/delete/payment |
| `"customers"` | Customer create/edit/delete |
| `"products"` | Product create/edit/delete |
| `"reports"` | Invoice mutations, product mutations (aggregated data) |
| `"purchase-bills"` | Bill create/edit/delete/payment |
| `"vendors"` | Vendor create/edit/delete |

> Always use two-arg form: `revalidateTag("invoices", { expire: 0 })` — single-arg is deprecated in Next.js 16.

---

## UI Patterns & Conventions

### CSS Classes (global)
```css
.page-stack       — vertical flex column for page content
.page-header      — title + action row at top of page
.page-title       — h1 style
.page-sub         — subtitle under h1
.card             — white/dark card with border + radius
.form-stack       — vertical flex for form sections
.form-card        — card containing a form section
.form-section-title — h2 inside form-card
.form-grid-2      — 2-column responsive grid for form fields
.form-actions     — row of Submit + Cancel buttons
.table-base       — base table styles
.table-empty-cell — centered "No data" cell
.error-banner     — red error banner (ONLY for load failures, not validation)
.loading-center   — centered loading text
```

### Component Usage

**Button**
```tsx
<Button variant="primary" href="/path">Link</Button>
<Button variant="secondary" size="sm" onClick={fn}>Action</Button>
<Button variant="danger" disabled={loading}>Delete</Button>
```

**FormField + Input**
```tsx
<FormField label="Name" required error={errors.name as string}>
  <Input value={name} onChange={e => setName(e.target.value)} placeholder="..." />
</FormField>
```

**Toast — for ALL validation and mutation feedback**
```tsx
const toast = useToast();
// Validation errors (replaces error banners inside forms):
toast({ type: "error", title: "Check form", message: "Name is required." });
// Success:
toast({ type: "success", title: "Saved", message: "Customer created." });
// Load failures only → keep as setError + early return (not toast)
```

**ConfirmDialog — for all destructive actions**
```tsx
<ConfirmDialog
  open={confirmOpen}
  title="Delete Customer"
  message="This cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  loading={deleting}
  onConfirm={handleDelete}
  onCancel={() => setConfirmOpen(false)}
/>
```

**OverlayLoader — while saving/submitting**
```tsx
{saving && <OverlayLoader text="Saving…" />}
```

**Breadcrumb**
```tsx
<Breadcrumb items={[
  { label: "Customers", href: "/sales/customers" },
  { label: customer.name, href: `/sales/customers/${id}` },
  { label: "Edit" },  // last item — no href
]} />
```

### Error Handling Pattern
```
Validation error (before API call) → toast({ type: "error", ... })  ← user sees it anywhere on page
API error (after fetch fails)      → toast({ type: "error", ... })
Load failure (useEffect fetch)     → setError("Failed to load") + early return with error-banner
```

### Soft Delete
All deletable entities have `deletedAt DateTime?`. DELETE routes set `deletedAt = new Date()` rather than removing the row. Queries filter `where: { deletedAt: null }`. Bin page queries `where: { deletedAt: { not: null } }`.

### Activity Logging
Every mutation (create/edit/delete/payment) must call:
```ts
import { logActivity } from "@/lib/activity";
await logActivity(session, "Created invoice", `Invoice ${inv.invoiceNumber}`, inv.id, "invoice");
```
`logActivity` is wrapped in try/catch — it never throws.

### Auth in API Routes
```ts
const session = await getServerSession(authOptions);
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// Admin-only:
if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

---

## How to Add a New Feature

### New Page
1. Create `src/app/(dashboard)/<section>/<page>/page.tsx` with `"use client"` at top
2. Use `useFetch("/api/<resource>")` for reads, `mutate()` after mutations
3. Show `{saving && <OverlayLoader />}` while submitting
4. Use `toast()` for all validation and mutation feedback
5. Add nav item to `NAV_GROUPS` in `DashboardShell.tsx` if needed (not `layout.tsx` — see correction above)

### New API Route
**Corrected**: writing Prisma queries directly in the route handler is the established, dominant pattern in this codebase today (most routes do this) — `src/lib/db.ts` only holds helpers for the original invoices/customers/products/reports list routes. Match whichever pattern the file you're editing already uses; don't assume every route must go through `db.ts`.
1. Create `src/app/api/<resource>/route.ts`
2. Call the right guard from `src/lib/apiAuth.ts` first (`requireSession`/`requireAdmin`/`requireWriteAccess`/`requireSectionAccess`) — or add the path to `middleware.ts`'s public allowlist if it's genuinely meant to be public
3. Write Prisma queries directly in the handler (the prevailing pattern), or add a helper to `src/lib/db.ts` if it belongs alongside the existing invoices/customers/products/reports helpers
4. Call `revalidateTag(tag, { expire: 0 })` after every write
5. Call `logActivity(...)` for mutations

### New DB Model
1. Add to `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name describe-change`
3. Run: `npx prisma generate` (stop dev server first on Windows — DLL lock)
4. Add query helpers to `src/lib/db.ts` only if it fits that file's existing scope; otherwise query Prisma directly in the route
5. Add a cache tag for the new model if needed

### New Sidebar Section
1. Add nav icon SVG to `NavIcons` in `DashboardShell.tsx` (not `layout.tsx`)
2. Add a new `NavGroup` to `NAV_GROUPS` (or add items to existing group)
3. If the landing page has sub-routes, add to `EXACT_MATCH_HREFS`
4. Set `adminOnly`/`sectionRequired`/`sectionsRequired` on the item if it should be role- or section-gated

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled URL (`?pgbouncer=true&connection_limit=1`) |
| `NEXTAUTH_SECRET` | Yes | Min 32 chars — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Production | Full deployed URL e.g. `https://your-app.vercel.app` |
| `GMAIL_USER` | Optional | Fallback Gmail sender (if not set in BusinessSettings) |
| `GMAIL_APP_PASSWORD` | Optional | Fallback Gmail App Password |
| `ENCRYPTION_KEY` | Optional | Dedicated key for encrypting secrets-at-rest, independent of `NEXTAUTH_SECRET`. Without it, encryption still works exactly as before (keyed off `NEXTAUTH_SECRET`). |

---

## Forbidden Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `"use cache"` directive | Causes "Blocking Route Server" errors | Use `unstable_cache` in `db.ts` |
| `cacheComponents: true` in next.config | Breaks this app | Leave next.config minimal |
| Single-arg `revalidateTag(tag)` | Deprecated in Next.js 16 | `revalidateTag(tag, { expire: 0 })` |
| ~~Prisma in route handlers~~ | **Corrected**: this is actually the dominant, accepted pattern in this codebase — the original "forbidden" claim was wrong | Match the existing pattern in the file you're editing; `db.ts` is only for the original invoices/customers/products/reports helpers |
| Import `db.ts` or `prisma.ts` in client components | Server-only modules | Use API routes + useFetch |
| Error banners inside forms for validation | Requires scroll to see | Use `toast({ type: "error", ... })` |
| Mutating without `revalidateTag` | Lists show stale data | Always revalidate after write |
| Removing `postinstall` from package.json | Breaks Vercel deploy | Keep it — it runs prisma generate |
| Changing invoice number format `SH-YYYY-0001` | Appears on printed invoices | Never change |
| Trusting client-supplied `isInterState` on invoice create/edit | GST compliance risk | Use `deriveIsInterState()` in `src/lib/gstLocation.ts` |
| Re-deriving low/out-of-stock inline | Causes inconsistent numbers across screens | Use `src/lib/stockStatus.ts` |
| Adding a stock-affecting mutation without `batchAdjustStock()` | Ledger becomes inaccurate | Always call it inside the same transaction, with the most specific `StockMovementType` |

---

## Invoice Number Format

`SH-{YYYY}-{0001}` — zero-padded 4-digit sequence, resets each year. Logic in `/api/invoices/route.ts`. Do not change.

## Bill Number Format

`PB-{YYYY}-{0001}` — same pattern as invoices but for purchase bills. Logic in `/api/purchase-bills/route.ts`.

---

## Deployment

- **Frontend:** Vercel — auto-deploys from `main` branch
- **Database:** Neon — use pooled URL in production
- **`postinstall`:** Runs `prisma generate` on Vercel build — required, never remove
- **Schema changes:** Run `npx prisma migrate dev` locally, commit the migration, Vercel will auto-apply via postinstall

---

## Known Issues / Technical Debt

| Issue | Status |
|-------|--------|
| ~~Theme flicker on initial load (light/dark flash)~~ | **Corrected: already fixed** — pre-hydration inline script in `src/app/layout.tsx` |
| `prisma generate` fails while dev server running on Windows (DLL lock) | Stop server → generate → restart |
| `suppressHydrationWarning` required on date elements to avoid SSR mismatch | Applied where needed |
| `payment/[paymentId]` PUT lacked a transaction (unlike other money-mutating routes) | Fixed — now uses the same Serializable transaction + retry pattern as payment creation |
