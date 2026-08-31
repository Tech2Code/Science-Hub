@AGENTS.md

<!-- AUTO-MAINTAINED PROJECT CONTINUITY DOCUMENT — updated 2026-08-11 -->

# Project Overview

Science Hub is a GST billing and inventory management web app for a science supplies business. It handles invoice creation with auto-numbering, customer management, product/stock tracking, payment recording, PDF generation, email delivery of invoices, purchases (vendors, purchase bills, payments), a stock movement ledger, a recycle bin, global search, credit notes, a GST filing package export, business branding, and role/section-based access management with activity logging.

**Roles**: `admin` (full access, only role that reaches Settings/Admin/Permissions), `staff` (default — full read/write, subject to section grants below), `manager` (read-only — blocked from all create/edit/delete by `requireWriteAccess()`/`useCanWrite()`, otherwise same section-gated visibility as staff). See `src/lib/sections.ts` for the six grantable `ProtectedSection` keys (`sales_overview`, `purchase_overview`, `reports_sales`, `reports_purchases`, `payments_received`, `payments_made`) and `src/app/api/admin/permissions/route.ts` for how an admin grants them per-user via `SectionPermission` rows.

**Full development history**: `DEVELOPMENT_LOG.md` (project root) is the complete build history from the first commit to the present, organized as chronological eras — what shipped, why, and what it replaced. It also carries a **Conventions** section (the actual working patterns this codebase has settled into — `OverlayLoader` for locking a page/modal mid-save, Escape/backdrop must be guarded separately from a dialog's visual overlay, never reset a "saving" flag on a path that ends in `router.push`, Settings sections save independently, list routes are paginated by default, server-side trust boundary for GST/totals/FY) and an **Operational Notes** section (Prisma/dev-server generate conflicts, `migrate dev` not working non-interactively, local `.env` vs. live DB, the Windows `prebuild`/`.next/dev` issue). Read it — not just this file — before assuming *why* something is built the way it is, before re-introducing a feature that was tried and deliberately removed (e.g. AI bill scan), or before touching any save/create/delete flow.

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
- **Route protection**: `middleware.ts` (project root) enforces a default-deny baseline on `/api/**` — any request without a valid session token is rejected before it reaches a route handler, except an explicit public allowlist (`/api/auth/*`, `/api/setup`, `/api/settings/branding`). This is in addition to, not a replacement for, each route's own `requireSession()`/`requireAdmin()`/`requireWriteAccess()`/`requireSectionAccess()` calls — it exists so a newly-added route is protected automatically even if a developer forgets to call one of those guards.
- **Rate limiting**: `src/lib/rateLimit.ts` is an in-memory fixed-window counter — defense-in-depth, not a distributed guarantee (each serverless instance tracks its own counts, and a redeploy resets them). A Redis/Upstash-backed version was tried and reverted for now (2026-07-24) — if revisited later, re-add `@upstash/redis` and wire it in behind the same function signature so callers don't need to change.
- **Testing**: Vitest (`tests/unit/**` pure `src/lib` logic, `tests/api/**` route-handler integration tests against a real disposable test database) + Playwright (`tests/e2e/**` full-browser flows). See **Testing** section below.

---

## Project Structure (full)

```
src/
  app/
    (dashboard)/
      layout.tsx                       # thin wrapper — just renders <DashboardShell>
      dashboard/page.tsx                # KPI cards + recent invoices
      admin/page.tsx                    # Profile, user management, activity log (paginated)
      bin/page.tsx                      # Recycle bin — 8 entity types, restore/permanent-delete/empty-all (invoices/purchase bills/credit notes never auto-purge)
      settings/page.tsx                 # Business settings, bank details (IFSC autofill), Gmail send-from
      products/
        page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
      brands/
        page.tsx, [id]/page.tsx
      categories/
        page.tsx, [id]/page.tsx
      sales/
        page.tsx                        # Sales overview/dashboard
        customers/  page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
        invoices/   page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
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
        route.ts                        # GET list (paginated/searchable/sortable, {data,total}) / POST create (SH-YYYY-0001)
        stats/route.ts                  # GET — summary totals over ALL matching invoices, independent of the list route's current page
        [id]/route.ts                   # GET/PUT/DELETE
        [id]/payment/route.ts, [id]/payment/[paymentId]/route.ts
        [id]/returns/route.ts           # GET/POST — returns capped by paid amount
      purchase-bills/
        route.ts                        # GET list (paginated/searchable/sortable, {data,total}) / POST create (PB-YYYY-0001)
        stats/route.ts                  # GET — summary totals (total/paid/pending, overdue count, available years) over ALL matching bills
        [id]/route.ts                   # GET/PUT/DELETE
        [id]/payment/route.ts
        payments/route.ts               # GET — all purchase payments (paginated)
        payments/stats/route.ts         # GET — total/count summary over ALL matching purchase payments
        upload/route.ts                 # POST/DELETE — Vercel Blob attachment (magic-byte validated)
      payments/route.ts                 # GET — all sales payments (paginated)
      payments/stats/route.ts           # GET — total/count summary over ALL matching payments, independent of the list route's current page
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
    blobStorage.ts         # Vercel Blob helpers; isPurchaseBillBlobUrl()/isLogoBlobUrl() require an exact match against this app's own store hostname (derived from BLOB_READ_WRITE_TOKEN, not just a `*.public.blob.vercel-storage.com` suffix — that suffix is shared by every store on the platform, see SEC-004 in docs/SCIENCE_HUB_AUDIT_REPORT.md)
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
    useDebouncedValue.ts   # useDebouncedValue(value, delayMs) — debounces a list page's search input before it hits the API
    useIdempotencyKey.ts   # client-generated idempotency key per create-form mount (2026-08-26) — sent by Invoice/PurchaseBill/Payment/PurchasePayment/Return create so a retried submission can't create a duplicate
    formulaSafety.ts       # neutralizeFormulaCell() — strips a leading =/+/-/@ from an exported cell value so Excel can't evaluate it as a formula on open (CSV/XLSX export hardening, in progress/uncommitted as of 2026-08-31 — see Current Work In Progress)
    listQuery.ts           # parsePageParams(searchParams, maxPageSize?) + monthYearToDateRange(month, year) — shared page/pageSize clamping and date-range parsing for every paginated list route
    brandQuery.ts, categoryQuery.ts, creditNoteQuery.ts, paymentQuery.ts, purchaseBillQuery.ts, purchasePaymentQuery.ts, vendorQuery.ts
                           # Per-entity buildXWhere()/buildXOrderBy() pairs — the list route and its companion /stats route both import the same builder so filter/sort semantics can't drift between them
  types/next-auth.d.ts
prisma/schema.prisma, seed.ts
```

**Not shown in the tree above but real, current features** (the tree predates them — treat this list as authoritative until the tree itself is redrawn):
- Pages: `admin/permissions/page.tsx` (+ `PermissionManager.tsx`) — section-permission grant grid; `sales/credit-notes/page.tsx` — list of all credit notes (`Return` rows); `reports/gst-reports/page.tsx` — GST filing package generator/downloader; `sales/rate-lists/` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`) — standalone price-sheet/catalog builder, independent of the Product catalog (see Rate Lists below).
- API routes: `admin/permissions/route.ts` (GET/POST section grants), `credit-notes/route.ts` (GET all, paginated/searchable), `credit-notes/stats/route.ts` (GET — summary totals over ALL matching credit notes), `products/stats/route.ts` (GET — stock/value summary over ALL matching products, independent of the list route's current page), `gst-filing/route.ts` (GET JSON, `?format=zip`, or `?format=xlsx`, gated by `requireGstFilingAccess()` — admin or both `reports_sales`+`reports_purchases`), `settings/branding/route.ts` (GET, deliberately public — name/tagline/logo shown on the unauthenticated login page), `settings/logo/route.ts` (POST/DELETE, admin-only, magic-byte validated upload to Vercel Blob), `export-xlsx/route.ts` (POST, generic rows→Excel export shared by Credit Notes/Sales/Purchase reports), `products/[id]/adjust-stock/route.ts` (POST, manual stock-adjustment — see Features Completed), `rate-lists/route.ts` (GET list paginated/searchable, POST create) + `rate-lists/[id]/route.ts` (GET/PUT/DELETE).
- Lib: `sections.ts` (the six `ProtectedSection` keys + `ROUTE_SECTION_MAP`), `useCanWrite.ts` (client-side `role !== "manager"` check), `businessBranding.tsx` (`BrandingProvider`/`useBranding()`), `gstFiling.ts`/`gstFilingZip.ts`/`gstFilingWorkbook.ts` (builds the filing report/ZIP/`.xlsx` workbook), `stockStatus.ts` (single shared `isOutOfStock`/`isLowStock`/`needsRestock` definition — use this instead of re-deriving the comparison inline), `gstLocation.ts` (`deriveIsInterState()` — server-side inter-state/intra-state derivation from place-of-supply vs. business state, used by both invoice create and edit instead of trusting the client's flag), `rateListForm.ts` (shared client+server calc/validation for Rate List items — `calcRateListItem()`, `validateAndBuildRateListItems()`), `rateListQuery.ts` (`buildRateListWhere`/`buildRateListOrderBy`).

**Rate Lists** (`sales/rate-lists`): a standalone, downloadable price-sheet/catalog builder — deliberately **not** linked to the `Product` catalog. Each `RateListItem` row (name, brand, unit, list rate, discount % or a "Net Rate" flag, computed amount) is free text, since a rate list's brand/unit strings (e.g. "QUALIGENS", "500 GM") routinely don't match this app's own `Brand`/`Product` records — this mirrors how invoice/purchase-bill line items can be unlinked custom rows via "just for this document" but skips the product-search step entirely. The item table's Unit field is a plain `Input` (not `UnitCombo` — see its "Do not" entry above for why: the table's `overflow-x: auto` wrapper clips `UnitCombo`'s dropdown). `RateListFormBody.tsx` is the shared two-column (Details+Items / Summary sidebar) layout for the New/Edit pages, mirroring `PurchaseBillFormBody`. `RateListPrintArea.tsx` is the shared PDF/print markup component, used both by the detail page (always mounted) and the list page's per-row **Preview** button (mounted on-demand: fetch the full item list, mount the component, wait a frame + `document.fonts.ready`, generate the blob, then unmount) — reuses `generateInvoicePdfBlob()` (`src/lib/generateInvoicePdf.ts`) against a `#rate-list-print-area` element; that function only *requires* a `<table>` with `<tbody>` rows to compute page-split boundaries, so the invoice-specific bells (repeating `thead`/`tfoot`, `data-invoice-item-row`, `#invoice-page-marker`, multi-copy stamping) are all optional and no-op gracefully when absent. The PDF header shows the business logo (`settings.logoUrl`, same `logoUrl` option as the invoice/purchase-bill PDFs) instead of a printed date, and the table has no total row (kept intentionally off the PDF — the on-screen detail page still shows a total for staff). PDF caching (`pdfCache.ts`, entity `"rate-list"`) keys on `rateList.updatedAt` + `settings.updatedAt`, so editing a rate list (or the business logo/settings) and coming back to Preview/Download always regenerates instead of serving a stale cached PDF — the list page's own Preview button doesn't cache at all, it always renders fresh. The detail page's action toolbar (Edit → Regenerate → Preview → Download → Share PDF → Delete, all `size="sm"`) follows the convention documented under "Rules — Do Not" above; its Share dropdown offers native `navigator.share`/WhatsApp/**Email** — email goes through `POST /api/send-rate-list` (mirrors `/api/send-invoice`: Gmail creds from `BusinessSettings` with env fallback, rate-limited, `requireWriteAccess()`), prompting for a recipient address in a small `Modal` since a rate list has no linked customer to default one from. The items table also has a **bulk-import** entry point (2026-08-11, added so a 60+ row supplier rate list doesn't have to be retyped by hand) — "Paste from Excel" (a `Modal` with a `Textarea`; parses a tab-separated clipboard paste with zero server round-trip) and "Upload .xlsx/.csv" (posts to `/api/rate-lists/parse-import`, which does the same parsing server-side after ExcelJS reads the sheet). Both funnel through the one shared parser, `parseRateListRows()`/`parsePastedRateListText()` in `src/lib/rateListImport.ts` — it detects a header row by column-name matching (Name/Brand/Unit/Discount/List Rate, any order/casing) and falls back to a positional guess by column count (5 cols = Name/Brand/Unit/Discount/List Rate; 7 cols = the "S.No, Chemical, Brand, Unit, Discount, List Rate, Amount" shape a supplier's own printed rate list commonly uses) when no header is recognized. Imported rows are merged into the form's existing items state (replacing only the still-empty scaffold rows, so importing into a fresh form doesn't leave a stray blank row) rather than saved directly — the user still reviews/edits before hitting Save, same as a manually-typed row. Any future rate-list-adjacent bulk-entry feature should extend this parser rather than writing a second one. Both the detail page ("Export Excel" toolbar button) and the list page (a per-row "Export" action, fetching that row's full item list first) can export a rate list's items to `.xlsx` via the app's existing generic `downloadXlsx()` helper (`src/lib/downloadXlsx.ts`) + `POST /api/export-xlsx` — the same infra Credit Notes/Sales/Purchase Reports already use, so this needed no new export endpoint, only the column mapping. **Bin integration shipped 2026-08-12**: `DELETE /api/rate-lists/[id]` still soft-deletes via `deletedAt`, but a deleted rate list now surfaces on the Bin page (8th entity type, standard 30-day auto-purge, restore/permanent-delete like customers/products/brands/vendors — see Recycle Bin section) instead of having no restore path. Remaining MVP gap (2026-08-11): still no public shareable link.

**Note on routing**: pages were reorganized under `sales/` and `purchases/` groups (invoices/customers/payments → `sales/*`; vendors/bills/payments → `purchases/*`), but the **API routes were not renamed** — `/api/invoices`, `/api/customers`, `/api/payments`, `/api/vendors`, `/api/purchase-bills` all stay at their original top-level paths. Only the UI routing changed.

**Sidebar nav groups** (`NAV_GROUPS` in `DashboardShell.tsx`): Dashboard · SALES (Overview, Customers, Invoices, Credit Notes, Rate Lists, Payments Received) · PURCHASES (Overview, Vendors, Purchase Bills, Payments Made) · CATALOG (Products, Brands, Categories) · REPORTS (Sales Reports, Purchase Reports) · SYSTEM (Admin, Settings — admin-only) · Recycle Bin (standalone).

---

## Key Files — Read Before Editing

| File | Why it matters |
|------|----------------|
| `src/lib/db.ts` | Holds plain Prisma helpers for the original invoices/customers/products/reports routes. Most newer routes (vendors, purchase-bills, search, etc.) write Prisma queries directly in the handler instead — match whichever pattern the file you're editing already uses. |
| `src/lib/useCache.ts` | Client fetch + cache hook. `useFetch(url)` returns `{ data, loading, mutate }`. Call `mutate()` after mutations. `bustCache(url)` for one-off busting. Throws on non-2xx JSON instead of silently returning the error body as data. |
| `src/lib/auth.ts` | NextAuth config. `NEXTAUTH_SECRET` must be a real secret in production. `authorize()` wraps the `prisma.user.findUnique()` lookup in a try/catch (2026-08-12) — a DB error (Neon cold-start, pooled-connection contention, transient network blip) is logged server-side and returns `null` the same as a wrong password, so a transient outage can't be distinguished from bad credentials by an attacker (or leak a stack trace to the client). |
| `src/lib/apiAuth.ts` | Four guards: `requireSession()`, `requireAdmin()`, `requireWriteAccess()` (blocks the `manager` role), `requireSectionAccess(section)` (checks `SectionPermission`, admin always bypasses). Call the right one at the top of every route. |
| `middleware.ts` | Default-deny baseline for `/api/**` — see Tech Stack above. Update `PUBLIC_API_PREFIXES`/`PUBLIC_API_EXACT` there if you add a new genuinely-public route. |
| `src/lib/validation.ts` | Shared `rules.*` validators (gstin, pan, ifsc, phone, etc.) and per-entity `validateXInput()` server-side validators — reuse these rather than writing new inline validation. |
| `src/lib/stockMovement.ts` | Every stock-affecting mutation (invoice create/edit/delete, purchase bill create/edit/delete, returns, bin restore, manual adjustment) must call `batchAdjustStock()` inside the same Prisma transaction — see the `StockMovementType` union in that file for the current, specific set of movement types (there is no generic `"adjustment"` type anymore). |
| `src/lib/crypto.ts` | Gmail app password and bank account number are encrypted at rest via this module. Uses a dedicated `ENCRYPTION_KEY` when set (new writes prefixed `encv2:`), otherwise derives the key from `NEXTAUTH_SECRET` (legacy `enc:` prefix) — both prefixes are recognized on decrypt so introducing `ENCRYPTION_KEY` never breaks reading older values. Passes through legacy unprefixed plaintext values untouched. |
| `src/lib/stockStatus.ts` | The single shared "is this product low/out of stock?" definition (`isOutOfStock`, `isLowStock`, `needsRestock`) — every dashboard, report, and product list page uses these instead of re-deriving the comparison inline, so the numbers always agree. |
| `src/lib/gstLocation.ts` | `deriveIsInterState(placeOfSupply, businessState)` — the server independently verifies inter-state vs. intra-state rather than trusting the client-supplied `isInterState` flag; falls back to the client's value only if the business's state isn't configured yet. |
| `src/lib/validation.ts`'s `toIstDateStr()` | Use this (not a bare `new Date(dateStr)` compare) whenever comparing a client-sent `"YYYY-MM-DD"` date against a parent document's full creation timestamp (payment/return date vs. invoice/bill date) — a bare compare treats midnight UTC of today as earlier than a same-day timestamp with a nonzero time-of-day, which broke "record a payment the same day you invoice" almost universally until fixed (2026-08-21, see BIZ-003 in `docs/SCIENCE_HUB_AUDIT_REPORT.md`). All four call sites (invoice payment create/edit, purchase-bill payment create, returns) now use it. |
| `(dashboard)/error.tsx` / `src/app/global-error.tsx` | React error boundaries (added 2026-08-21, see RESIL-001) — `(dashboard)/error.tsx` sits beside, not inside, the dashboard layout so `DashboardShell`'s sidebar/topbar survive a page-level render crash; `global-error.tsx` is the self-contained root-layout-level fallback. Before this the app had none — an unhandled render error crashed to a blank/generic screen. |
| `prisma/schema.prisma` | Source of truth for the data model. Run `npx prisma migrate dev` after schema changes. |
| `src/lib/documentNumbering.ts` | Shared by both numbering routes below. `getIndianFinancialYear(date)` (Apr-Mar FY boundary, not calendar year — a bill dated Jan-Mar belongs to the FY that started the previous April) + `formatFinancialYearLabel(startYear)` (renders it as the printed `"2026-27"` label). `deriveDefaultPrefix(name)` auto-suggests a prefix from the business name when none is configured. `NUMBER_FORMATS` is the admin-selectable layout registry (`NumberFormatId`: `prefix_fy_seq` → `SH-2026-27-0001`, `seq_fy` → `18/2026-27` no prefix/no padding, `prefix_seq_fy` → `SH-18/2026-27`) — each entry pairs a `render()` with a `matcher()` regex that extracts the sequence from an already-formatted number, since the sequence isn't always the number's fixed last segment once the layout is configurable (`seq_fy` puts it first, and doesn't zero-pad, so plain string sort would rank `"10/..."` before `"9/..."`). `computeNextNumber()` finds the true max sequence via `findMaxSequence()` over candidates already narrowed by `numberFormatDbFilter()` (a Prisma `startsWith`/`endsWith` filter appropriate to the chosen layout), then applies the one-time "next number" override from Settings if it's higher. |
| `src/app/api/invoices/route.ts` | Invoice number layout is admin-configurable (Settings → Document Numbering: `BusinessSettings.invoiceNumberFormat`, default `prefix_fy_seq` → `SH-2026-27-0001`; prefix auto-derived from the business name unless overridden), generated inside a Serializable transaction with retry-on-conflict. The FY segment is the Indian financial year (Apr-Mar) the invoice's `date` falls in, not the calendar year. Don't break the sequence-extraction logic in `documentNumbering.ts`. |
| `src/app/api/purchase-bills/route.ts` | Same configurable-layout pattern (`BusinessSettings.purchaseBillNumberFormat`, default prefix `PB`), with the FY segment derived from the bill's own `billDate` (not "now" — a bill can be entered late for an earlier period). |
| `src/components/layout/DashboardShell.tsx` | The actual sidebar/topbar/auth-guard shell (not the route group's `layout.tsx`, which is just a wrapper). Nav structure and `GlobalSearch` mounting live here. Its `isMobile()`/`check()` mobile-drawer threshold is `window.innerWidth < 1024` (widened from 768, 2026-08-14, so tablet-width screens get the overlay drawer too) — `DashboardShell.module.css`'s and `GlobalSearch.module.css`'s own `@media (max-width: 1024px)` rules must stay numerically in sync with this or the sidebar/search UI and the JS-driven layout state disagree at tablet widths. This is a separate breakpoint from the plain form-field compact-mode one (`768px`, used by `Input`/`Select`/`DatePicker`/`PasswordInput`/`PhoneInput`/`Toast` — standardized off an inconsistent 767/768 mix the same day) — don't conflate the two when adding a new responsive rule. |
| `src/components/dialogs/Modal.tsx` | The one popup-dialog component used app-wide (19 call sites as of 2026-08-14). Takes `variant="center" \| "fullscreen"` (default `"center"`; every current call site passes `"fullscreen"`) and an optional `footer` prop — header and footer render outside the scrollable `body`, sized on `height: auto` + a `max-height` cap so a short form (e.g. Terms & Conditions) doesn't inherit a tall form's (e.g. Document Numbering) fixed height. A `<form>` inside `children` and its submit button inside `footer` are DOM siblings, not nested — link them with a matching `id`/`form="..."` attribute (the `Button` component's `form` prop forwards this) rather than nesting the button inside the form. See Settings page (`src/app/(dashboard)/settings/page.tsx`) for the reference pattern. |

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

A `/stats` route has its own client-side cache key (`useFetch` caches by full URL, and a stats URL's query string differs from its list route's) — a list page that mutates data must call **both** `mutate()` (the list) and its stats hook's own `mutate()` (e.g. `mutateStats()`) after a write, or the stat cards go stale even though the list refreshes. See `sales/invoices/page.tsx` for the reference pattern (`Promise.all([mutate(), mutateStats()])`).

`bustCache(url)` (`src/lib/useCache.ts`) only invalidates that one exact URL string — it's the wrong tool once an endpoint carries query params beyond a fixed base (any paginated/filterable list, e.g. `/api/reports?type=outstanding&page=1&pageSize=20`), since the cached key never matches the bare string passed to `bustCache`. Use `bustCachePrefix(prefix)` instead from a page that doesn't own the cached URL (e.g. invoice-create busting the Reports page's cache before navigating away) — it matches `prefix` itself or `` `${prefix}?...` ``, so pass the endpoint's path only (`"/api/reports"`), not a partial query string, or the same silent-miss bug recurs. Fixed 2026-08-17 in `sales/invoices/new/page.tsx`, which had been calling `bustCache("/api/reports?type=outstanding")` — a permanent no-op against the paginated outstanding-reports cache key.

---

## Rules — Do Not

- Writing Prisma queries directly in route handlers is the established pattern for most routes — `src/lib/db.ts` only holds helpers for the original invoices/customers/products/reports list routes. Match the existing pattern for the file you're editing.
- **Do not** add `"use cache"` directive anywhere — it requires `cacheComponents: true` which triggers "Blocking Route Server" errors on navigation.
- **Do not** add `cacheComponents: true` to `next.config.ts` — confirmed to break this app.
- **Do not** use single-arg `revalidateTag(tag)` — deprecated in Next.js 16. Always use `revalidateTag(tag, { expire: 0 })`.
- **Do not** import from `src/lib/db.ts` or `src/lib/prisma.ts` in any client component — server-only modules.
- **Do not** create a mutation route handler (POST/PUT/DELETE) without calling `revalidateTag` — lists will show stale data.
- **Do not** assume the invoice/purchase-bill/credit-note number has a fixed shape or that the sequence is a fixed-index segment — the layout itself is admin-configurable per document type (Settings → Document Numbering, `BusinessSettings.invoiceNumberFormat`/`purchaseBillNumberFormat`/`creditNoteNumberFormat`, see `NUMBER_FORMATS` in `src/lib/documentNumbering.ts`). Always go through `computeNextNumber()`/`numberFormatDbFilter()`/`findMaxSequence()` to generate or parse a number rather than hand-rolling string splitting. The year segment is always the Indian financial year (Apr-Mar, via `getIndianFinancialYear()`/`formatFinancialYearLabel()`), never the calendar year — this applies to all three document types, including the invoice/bill/credit-note's own `date` field, which cannot be edited across a financial-year boundary once its number is generated (see `/api/invoices/[id]`, `/api/purchase-bills/[id]`).
- **Do not** hand-roll `where`/`orderBy`/pagination logic in a list route handler when a `*Query.ts` helper already exists for that entity (`brandQuery.ts`, `categoryQuery.ts`, `creditNoteQuery.ts`, `paymentQuery.ts`, `purchaseBillQuery.ts`, `purchasePaymentQuery.ts`, `vendorQuery.ts`, or `getInvoices()`/`getProducts()` in `db.ts`) — the matching `/stats` route imports the same builder, so a route-local reimplementation will drift and make the stat cards disagree with the list.
- **Do not** write to `Invoice.balanceDue`, `PurchaseBill.balanceDue`, or `Product.isLowStock` from application code — they're real Postgres `GENERATED ALWAYS AS (...) STORED` columns computed by the database itself, not plain defaulted columns.
- **Do not** remove the `postinstall` script from package.json — it generates the Prisma client on Vercel.
- **Do not** mutate stock without going through `batchAdjustStock()` in the same transaction — the ledger must stay authoritative. Use the most specific `StockMovementType` for the action (see `stockMovement.ts`), not a generic catch-all.
- **Do not** accept or delete arbitrary blob URLs for purchase-bill attachments or the business logo — always go through `isPurchaseBillBlobUrl()`/`isLogoBlobUrl()` + `deleteAttachmentBlob()` in `blobStorage.ts`. These check an exact hostname match against this app's own Blob store (not just the shared `*.public.blob.vercel-storage.com` suffix).
- **Do not** allow `PUT /api/products/[id]` to accept a `stock` field — it's deliberately rejected server-side (not just hidden client-side) so every stock change is forced through `POST /api/products/[id]/adjust-stock`'s audited `batchAdjustStock()` ledger path. The edit form's Stock input is read-only (`ProductFormFields.tsx`'s `stockReadOnly` prop) with a hint pointing to "Adjust Stock"; the New Product page is unaffected (opening stock has no ledger history to violate).
- **Do not** trust a client-supplied `isInterState` flag on invoice create/edit — always derive it server-side via `deriveIsInterState()` in `src/lib/gstLocation.ts` (falls back to the client's value only if the business's state isn't configured).
- **Do not** re-derive "is this product low/out of stock?" inline — use `isOutOfStock()`/`isLowStock()`/`needsRestock()` from `src/lib/stockStatus.ts` so every screen agrees.
- **Do not** add a new API route without either an existing `requireSession()`/`requireAdmin()`/`requireWriteAccess()`/`requireSectionAccess()` call in the handler, or adding it to `middleware.ts`'s public allowlist if it's genuinely meant to be public — the default-deny middleware will otherwise 401 it, which is the intended safety net, not a bug.
- **Do not** hand-roll a "unit" text field (Nos/Kg/500 GM/...) as a plain `Input` or a constrained `Select` — use `UnitCombo` from `src/components/ui/UnitCombo.tsx` (typeable free text + a filtered suggestion dropdown, so an unusual size+unit string like "500 GM" or "1 LTR" is never blocked, but the common short units are still one click away). Used by the invoice/purchase-bill "Add Custom Item" quick-add modals (2026-08-11, replacing two near-duplicate hand-rolled combos), and by the main Product create/edit form's own Unit field (`ProductFormFields.tsx`, also 2026-08-11 — replaced the old constrained `Select` over `PRODUCT_UNITS`, so a product can now be given a unit string not on that suggestion list instead of being blocked). **Exception**: the Rate List items table (`RateListItemsTable.tsx`) uses a plain `Input` instead — `UnitCombo`'s dropdown is `position: absolute`, and that table's wrapper (`.itemsTableWrap`) is `overflow-x: auto` for horizontal scroll on narrow screens, which clips the dropdown before it can render below the fold (confirmed broken 2026-08-11, reverted same day). Don't re-apply `UnitCombo` inside any table/container that scrolls its own overflow unless it's first changed to portal the dropdown to `document.body` the way `Select.tsx` does — until then, prefer a plain `Input` inside a scrolling table.
- **Do not** build a new form with raw `<input>`/`<textarea>`/`<select>` or ad-hoc validation — every form must use the shared components in `src/components/ui/Input.tsx` (`Input`, `Select`, `Textarea`, `FormField`, and `src/components/ui/PasswordInput.tsx`'s `PasswordInput`) plus `rules`/`validate`/`validateForm` from `src/lib/validation.ts`. Raw `<input>` is only acceptable for types with no common equivalent: `search`, `color`, `file`, `checkbox`, `radio`. `src/app/(dashboard)/admin/page.tsx` is the gold-standard reference — every form there follows this exact pattern:
  - `<form noValidate>` on every form — without it, `type="email"` still triggers the browser's own format popup even with no `required` attribute.
  - Never pass `required` to `Input`/`PasswordInput`/`Select` — it renders as a native HTML `required` attribute and pops up the browser's own validation bubble instead of the app's error UI. (`required` on `FormField` itself is fine — that only adds the visual `*` to the label, it doesn't touch the DOM input.)
  - Validation errors render per-field via `<FormField error={fieldErrors.x}>`, not a single top banner/toast — clear that field's error in its own `onChange` handler, and clear the whole error object when the form/dialog opens or resets.
  - **Edit forms** (editing an already-existing row — product/customer/vendor edit pages, rename dialogs, the invoice-edit "Bill To" customer form, etc.): the submit button's `disabled` must explicitly check every mandatory field is non-empty (e.g. `!form.name.trim() || !form.email.trim()`) in addition to any `saving`/`isDirty` flag — dirty-only or saving-only gating lets an emptied mandatory field through once native validation is removed. Fields start pre-filled with valid data here, so this check only fires when the user actively clears something.
  - **New/create forms** (fields start empty — new-entity pages like `products/new`/`sales/customers/new`/`purchases/vendors/new`, and inline "quick add" modals like the invoice/purchase-bill "Add Custom Item"/"Add Vendor"/"Add New Customer" popups and "Record Payment" dialogs): the submit button's `disabled` should check only `saving` (2026-08-14 change) — do **not** also gate on field `.trim()` checks. A disabled-by-default button on an empty form gives no signal about *which* field is missing; letting the click through and relying on the existing `validate()`/`validateForm()` call already wired into the submit handler to populate `FormField` errors is clearer feedback, and the actual save is blocked there regardless. This only applies where that on-submit validation already exists and renders through `FormField`. Extended 2026-08-14 to the Categories/Brands Add & Rename modals (which previously had no `FormField`/error UI at all — `handleAdd`/`handleRename` silently no-op'd on an empty name; now they show a proper inline error) and to Settings' Identity/Bank/Email edit-forms specifically (an exception to the "edit forms keep the `.trim()` guard" rule above, since those three already had full `FormField` validation wired and the guard was purely redundant with it). `RateListItemsTable`'s paste-import (`disabled={!pasteText.trim()}`) still has no `FormField`/error UI and still needs the `.trim()` guard until that's added (see Pending Tasks).
- **Do not** give a popup dialog its own one-off centered-box markup — use `Modal` (`src/components/dialogs/Modal.tsx`) with `variant="fullscreen"` (the app-wide default as of 2026-08-14; the plain `"center"` variant still exists but nothing currently opts into it) and pass action buttons via its `footer` prop rather than placing them inside the scrollable body — this keeps Save/Cancel reachable without scrolling on a tall form and pinned consistently across every popup in the app (Settings' 6 section modals, both quick-add-item modals, both inline vendor/customer create modals, Categories/Brands Add & Rename, Admin's New/Edit User, both Rate List modals). When the modal's content is a `<form>`, give the form an `id` and reference it from the footer's submit button via `form="..."` (the shared `Button` component forwards a `form` prop for exactly this) rather than nesting the button inside the form, since footer and body are sibling regions, not parent/child.
- **Do not** build a new entity detail page's action toolbar with ad-hoc button sizing/layout — every detail page (invoice, purchase bill, rate list, ...) shares one convention, established on `sales/invoices/[id]/page.tsx` (gold-standard reference) and applied identically to `sales/rate-lists/[id]/page.tsx` (2026-08-11):
  - `page-header` div: left side = `<Breadcrumb>` + a small `styles.metaText` line (item/created-by/date summary); right side = a `styles.toolbarActions` flex-wrap div holding every action as a `<Button size="sm">` (never `"md"`/`"full"` in a toolbar — that's what makes a page's buttons look oversized next to every other page).
  - Button order: entity-specific mutations first (e.g. Edit, Record Payment) → **Regenerate** (secondary, discards the cached PDF variant and re-renders — only meaningful once the page caches a PDF via `pdfCache.ts`) → **Preview**/View (`viewOutline`, opens `PdfPreviewModal`) → **Download PDF** (secondary) → **Share PDF** (secondary, dropdown: native `navigator.share`/WhatsApp, plus Email/Copy-Download as a fourth item depending on the entity — Email when a send endpoint exists (invoice's customer email autofills; rate list has no linked recipient so it prompts via a small `Modal` before calling `/api/send-rate-list`), Copy-Download otherwise — see `handleShare` on each detail page) → **Delete** (`dangerOutline`) last.
  - The share dropdown's CSS (`shareWrap`/`shareOverlay`/`shareMenu`/`shareMenuTitle`/`shareMenuItem`/`shareMenuItemIcon`) is copy-pasted per page (not extracted to a shared component yet) — copy it from `rateListDetail.module.css` or `invoiceDetail.module.css` rather than reinventing it.
  - A per-entity PDF print layout used by more than one page (a detail page plus a list page's on-demand Preview, or multiple pages entirely) should be its own component (e.g. `RateListPrintArea.tsx`) rather than duplicated inline JSX, so a later "remove X from the PDF" request only needs one edit.

---

## Database Models (current)

- **User** — id, name, email(unique), password(bcrypt), role(admin/staff/**manager**), tokenVersion(Int), createdAt → invoices[], activityLogs[], resetTokens[], purchaseBillsCreated[], stockMovementsCreated[], **sectionPermissions[]**
- **SectionPermission** — id, userId, section(one of 6 `ProtectedSection` keys), enabled(default false), createdAt, updatedAt — `@@unique([userId, section])`. See `src/lib/sections.ts`.
- **PasswordResetToken** — id, userId, token(unique), expiresAt, usedAt?, createdAt
- **ActivityLog** — id, userId, action, details, entityId?, entityType?, createdAt (indexes: userId, createdAt)
- **Customer** — id, name, phone?, email?, address?, city?, state?, pincode?, gstin?, deletedAt?
- **Category** — id, name(unique), deletedAt?
- **Brand** — id, name(unique), deletedAt?
- **Product** — id, name, description?, sku?(unique), barcode?, hsn?, unit(default "Nos"), price, purchasePrice?, gstRate(default 18), stock, minStock(default 5), maxStock?, reorderLevel?, categoryId?, brandId?, isActive(default true), deletedAt?, **isLowStock** Boolean — real Postgres `GENERATED ALWAYS AS ("stock" > 0 AND "stock" <= "minStock") STORED` column, mirrors `src/lib/stockStatus.ts`'s `isLowStock()`; never write to it from app code
- **Invoice** — invoiceNumber(unique, `SH-YYYY-0001`), date, dueDate?, customerId, userId, status(unpaid/partial/paid), subtotal, cgst, sgst, igst, total, paidAmount, notes?, isInterState, **placeOfSupply** String?, **reverseCharge** Boolean(default false), **transportCharge** Float(default 0)/**transportChargeGstRate** Float(default 0)/**transportChargeGstAmount** Float(default 0) — optional freight/transport line, shown on the printed invoice with its own GST rate/amount, kept separate from `cgst`/`sgst`/`igst` (which stay a pure sum of item-level tax); `transportChargeGstAmount` is always server-recomputed from charge × rate, never trusted from the client, deletedAt?, **balanceDue** Float — real Postgres `GENERATED ALWAYS AS ("total" - "paidAmount") STORED` column, lets the invoices list sort server-side by outstanding balance; never write to it from app code
- **InvoiceItem** — invoiceId, productId, name, hsn(default ""), quantity, unit, price, discountPercent(default 0), discountAmount(default 0), gstRate, gstAmount, total
- **Payment** — invoiceId, amount, method(default "cash"), reference?, date, notes?
- **Return** / **ReturnItem** — invoice returns, i.e. **credit notes**; `Return.creditNoteNumber` (unique, nullable — old rows predate numbering) is the credit note's own auto-number, same configurable-layout/FY pattern as invoices (default prefix `CN`; see `BusinessSettings.creditNoteNumberPrefix`/`nextCreditNoteNumberOverride`/`creditNoteNumberFormat`); restores stock, capped by the invoice's paid amount and remaining returnable quantity
- **BusinessSettings** — singleton row `id="singleton"`: name, tagline, email(printed), phone, address, city, state, pincode, gstin, **pan**, gmailUser, gmailAppPassword(encrypted), **bankName, bankAccountName, bankAccountNumber**(encrypted)**, bankIfsc, bankBranch**, **termsAndConditions**, **invoiceNumberPrefix?, nextInvoiceNumberOverride?, purchaseBillNumberPrefix?, nextPurchaseBillNumberOverride?, invoiceNumberFormat?, purchaseBillNumberFormat?** (all nullable — null means "use the auto default"; the "next number" fields are one-time-use, cleared back to null the moment a create consumes them), updatedAt
- **Vendor** — id, name, company?, gstin?, phone?, email?, address?, notes?, isActive(default true), deletedAt?
- **PurchaseBill** — billNumber(unique, `PB-YYYY-0001`), vendorId, billDate, dueDate?, subtotal, taxAmount, discount, total, paidAmount, status(unpaid/partial/paid/cancelled), notes?, attachmentUrl?/attachmentName?(Vercel Blob), category?, createdByUserId, **transportCharge** Float(default 0)/**transportChargeGstRate** Float(default 0)/**transportChargeGstAmount** Float(default 0) — same shape/reasoning as `Invoice.transportCharge` above, deletedAt?, **balanceDue** Float — real Postgres `GENERATED ALWAYS AS ("total" - "paidAmount") STORED` column, backs the `balance_high` sort option; never write to it from app code (indexes: vendorId, status, billDate)
- **PurchaseBillItem** — purchaseBillId, productId?, name, quantity, unit(default "Nos"), purchasePrice, gstRate(default 0), gstAmount(default 0), total
- **PurchasePayment** — purchaseBillId, amount, method(default "cash"), reference?, date, notes? (index: purchaseBillId)
- **StockMovement** — productId?(nullable, `onDelete: SetNull`), **productName**(snapshot, default ""), type — specific values only, see `StockMovementType` in `src/lib/stockMovement.ts` (`sale`, `sale_edit_reverse`, `sale_edit_apply`, `sale_delete_restore`, `sale_bin_restore`, `purchase`, `purchase_edit_reverse`, `purchase_edit_apply`, `purchase_cancel`, `purchase_uncancel`, `purchase_delete_restore`, `purchase_bin_restore`, `return`, `return_delete_reverse`, `return_bin_restore`, `manual` — **no generic `"adjustment"` type**), documentType(invoice/purchase_bill/credit_note/manual), quantity(signed), balanceAfter, reference?, notes?, purchaseBillId?, createdByUserId?, createdAt (indexes: productId+createdAt, createdAt, documentType)
- **RateList** — id, title, note?, createdByUserId, createdAt, updatedAt, deletedAt? → items[] (`RateListItem`). No relation to `Product`/`Brand` — see Rate Lists above for why. `deletedAt` now goes through the standard Bin flow (2026-08-12) like customers/products/brands/vendors — 30-day auto-purge, restore/permanent-delete from the Bin page — not the indefinite-retention path used by invoices/purchase bills/credit notes, since a rate list isn't a GST-numbered document.
- **RateListItem** — rateListId (`onDelete: Cascade`), serialNo(display order), name, brand?(free text), unit, isNetRate(default false), discountPercent(default 0, ignored when `isNetRate`), listRate, amount(computed server-side: `isNetRate ? listRate : listRate - listRate*discountPercent/100`, rounded to 2dp)

> ⚠️ Three distinct email concepts: `User.email` = login email · `BusinessSettings.email` = printed on invoices · `BusinessSettings.gmailUser` = Gmail used to send emails

---

## API Routes (full list)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/invoices` | List invoices — paginated/searchable/sortable (`?status`, `?customerId`, `?search`, `?sort`, `?month`, `?year`, `?page`, `?pageSize`), returns `{data, total}` / create invoice — auto-numbers `SH-YYYY-0001`, requires `placeOfSupply`, optional inline customer creation, decrements stock + records `StockMovement` |
| GET | `/api/invoices/stats` | Summary totals (outstanding/paid/etc.) over ALL invoices matching the same filters as the list route, independent of its current page |
| GET/PUT/DELETE | `/api/invoices/[id]` | Get / full edit (reverses+reapplies stock, re-validates returned-qty floor) / soft-delete (restores stock, double-delete safe) |
| GET/POST | `/api/invoices/[id]/returns` | List returns for an invoice / create a return (credit note, configurable layout/prefix/FY via `documentNumbering.ts`, default `CN-2026-27-0001`) — validated against paid amount and remaining returnable qty inside a Serializable tx; restores stock |
| DELETE | `/api/invoices/[id]/returns/[returnId]` | Soft-delete a credit note; reverses its stock effect |
| GET | `/api/credit-notes` | Credit notes (non-deleted `Return` rows) across every invoice — paginated/searchable (`buildCreditNoteWhere`/`buildCreditNoteOrderBy` from `creditNoteQuery.ts`), returns `{data, total}` |
| GET | `/api/credit-notes/stats` | Summary totals over ALL matching credit notes, independent of the list route's current page |
| POST | `/api/invoices/[id]/payment` | Record a payment, recompute `paidAmount`/status |
| PUT | `/api/invoices/[id]/payment/[paymentId]` | Edit an existing payment, recompute invoice status |
| GET/POST | `/api/customers` | List customers (with `createdBy`) / create customer |
| GET/PUT/DELETE | `/api/customers/[id]` | Get / edit (blocked if in bin) / soft-delete (blocked if active invoices exist) |
| GET/POST | `/api/products` | List — paginated/searchable/sortable (`?search`, `?stockFilter`, `?sort`, `?page`, `?pageSize`, via `getProducts()` in `db.ts`), returns `{data, total}`, each row with `createdBy` / create product |
| GET | `/api/products/stats` | Stock/value summary over ALL matching products, independent of the list route's current page |
| GET/PUT/DELETE | `/api/products/[id]` | Get (incl. last 15 stock movements) / edit / soft-delete (blocked if used in invoice **or active purchase-bill** line items) |
| POST | `/api/products/[id]/adjust-stock` | Manual stock correction after a physical count — requires a `notes` reason, writes a `"manual"` ledger row |
| GET/POST | `/api/brands` | List — paginated/searchable (`brandQuery.ts`), returns `{data, total}` (product counts, `createdBy`) / create brand |
| GET/DELETE | `/api/brands/[id]` | Detail (assigned products) / soft-delete (blocked if products assigned or used in invoices) |
| GET/POST | `/api/categories` | List — paginated/searchable (`categoryQuery.ts`), returns `{data, total}` (product counts) / create category |
| GET/PUT/DELETE | `/api/categories/[id]` | Detail / rename / soft-delete (same blocking rules as brands) |
| GET/POST | `/api/vendors` | List — paginated/searchable (`vendorQuery.ts`), returns `{data, total}` (active bill counts) / create vendor (requires phone+address) |
| GET/POST | `/api/rate-lists` | List — paginated/searchable (`rateListQuery.ts`), returns `{data, total}` (item counts, `createdBy`) / create a rate list with its items in one call |
| GET/PUT/DELETE | `/api/rate-lists/[id]` | Get (with items) / edit (bulk-replaces all items — delete-and-recreate in one transaction, no stock/ledger side effects to reverse) / soft-delete (no bin restore UI yet) |
| POST | `/api/send-rate-list` | Email a rate list PDF to an address typed in at share-time (no linked customer to default one from); rate-limited, `requireWriteAccess()`, Gmail creds from `BusinessSettings` with env fallback — mirrors `/api/send-invoice` |
| POST | `/api/send-purchase-bill` | Email a purchase bill PDF to the vendor (or a typed-in address); added 2026-08-26 alongside the cache/idempotency hardening pass — same rate-limited/Gmail-creds pattern as `/api/send-invoice`/`/api/send-rate-list` |
| POST | `/api/rate-lists/parse-import` | Parses an uploaded `.xlsx`/`.csv` (ExcelJS for `.xlsx`, plain comma-split for `.csv`) into Rate List item rows via the shared `parseRateListRows()` (`src/lib/rateListImport.ts`) — returns parsed JSON only, writes nothing to the DB; the New/Edit page merges the rows into its own items state so they're still reviewable/editable before Save, same as a manually-typed row |
| GET/PUT/DELETE | `/api/vendors/[id]` | Detail (purchase bills) / edit / soft-delete (blocked if active bills exist) |
| GET/POST | `/api/purchase-bills` | List — paginated/searchable/sortable (`?status` incl. synthetic `overdue`, `?vendorId`, `?search`, `?sort` — `newest/oldest/vendor_az/vendor_za/amount_high/amount_low/balance_high`, `?month`, `?year`, `?page`, `?pageSize`, via `purchaseBillQuery.ts`), returns `{data, total}` / create — auto-numbers `PB-YYYY-0001`, server recomputes GST/totals, increments stock, optional inline payment |
| GET | `/api/purchase-bills/stats` | Summary totals (total/paid/pending, overdue count, available years) over ALL matching bills, independent of the list route's current page |
| GET/PUT/DELETE | `/api/purchase-bills/[id]` | Get / edit (reverses+reapplies stock; handles cancel/un-cancel; blocks item edits on paid/cancelled bills) / soft-delete (reverses stock, double-delete safe) |
| POST | `/api/purchase-bills/[id]/payment` | Record a payment, recompute status |
| GET | `/api/purchase-bills/payments` | Purchase payments — paginated (`purchasePaymentQuery.ts`), returns `{data, total}` |
| GET | `/api/purchase-bills/payments/stats` | Total/count summary over ALL matching purchase payments, independent of the list route's current page |
| POST/DELETE | `/api/purchase-bills/upload` | Upload attachment to Vercel Blob (size/MIME/magic-byte validated) / delete an orphaned never-attached upload |
| GET | `/api/purchase-reports` | `?type=summary\|outstanding\|category\|stock-ledger` — `summary`/`category` exclude cancelled bills from spend totals; `stock-ledger` returns the entire ledger (not purchase-only, despite the route name) |
| GET | `/api/reports` | `?type=summary\|outstanding\|stock\|sales-dashboard\|purchase-dashboard\|combined-dashboard\|gst-summary` — `purchase-dashboard`'s Top Vendors, and monthly spend/paid aggregates, exclude cancelled bills |
| GET | `/api/gst-filing` | GSTR-style filing package (Sales/Purchase Register, B2B/B2C split, Credit Notes, HSN Summary) for a date range — JSON, `?format=zip`, or `?format=xlsx` (2026-08-12, via a dedicated `buildGstFilingWorkbook()` in `src/lib/gstFilingWorkbook.ts` — not the generic `/api/export-xlsx` route, since the filing package needs multiple named sheets rather than one rows→columns table). Gated by `requireGstFilingAccess()`: admin, or both `reports_sales`+`reports_purchases` sections |
| POST | `/api/export-xlsx` | Generic rows→`.xlsx` export shared by Credit Notes / Sales Reports / Purchase Reports (capped 20,000 rows / 50 cols) |
| GET | `/api/payments` | Sales payments — paginated (`paymentQuery.ts`), returns `{data, total}` |
| GET | `/api/payments/stats` | Total/count summary over ALL matching sales payments, independent of the list route's current page |
| GET | `/api/search` | Global search (`?q=`) across invoices/customers/products/vendors/purchase bills/brands/categories, 5 results per group |
| GET | `/api/bin` | Auto-purges most bin item types older than 30 days (invoices/purchase bills/credit notes are exempt — see Recycle Bin section), then lists remaining across 8 entity types with `daysLeft` (`-1` for the exempt types)/`deletedBy`/`protectedReason` |
| POST/DELETE | `/api/bin/[type]/[id]` | Restore (re-applies stock, double-restore safe) / permanent-delete (admin-only, per-type FK checks, blob cleanup) — the only way to hard-delete an invoice/purchase bill/credit note |
| DELETE | `/api/bin/empty` | Admin-only bulk-purge of every bin item at once |
| GET/PUT | `/api/settings` | Get (non-admins don't see `gmailUser`) / update business settings incl. bank details, Gmail creds (encrypted at rest) |
| GET | `/api/settings/branding` | Public, no auth — name/tagline/logoUrl only, needed on the unauthenticated login page |
| POST/DELETE | `/api/settings/logo` | Admin-only logo upload/removal (Vercel Blob, size/MIME/magic-byte validated) |
| GET | `/api/settings/ifsc-lookup/[code]` | Admin-only proxy to Razorpay's public IFSC directory (server-side, 5s timeout) |
| GET | `/api/pincode-lookup/[code]` | Any authenticated user — proxy to India Post's public pincode directory (server-side, 5s timeout, rate-limited); used by every customer/vendor/settings address form's city+state autofill |
| GET/POST | `/api/admin/permissions` | Admin-only: list non-admin users' section grants / upsert one `(userId, section, enabled)` grant |
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

`src/app/(dashboard)/bin/page.tsx` covers 8 entity types (invoices, purchase bills, customers, products, brands, categories, vendors, **rate lists** — added 2026-08-12). Deleting any of these from its own list/detail page is a single "Move to Bin" soft-delete (`ConfirmDialog`) — there is no permanent-delete choice at delete time for any entity; permanent deletion is only ever available from the Bin page itself, one item at a time (or via admin-only "Empty Bin"). Rate lists follow the standard 30-day auto-purge path (same as customers/products/brands/vendors) since they're not a GST-numbered document — they are not one of the three exempt types below.

`GET /api/bin` auto-purges most soft-deleted rows older than 30 days on every load (products, customers, brands, categories, vendors — each with its own FK-safety check, e.g. skipping a customer still referenced by an active invoice), and annotates remaining items with `protectedReason` explaining why they can't yet be permanently deleted. `DELETE /api/bin/empty` (admin-only) purges everything at once in FK-safe order (invoices/purchase-bills first, then customers/products, then brands/categories, then vendors) — including invoices/purchase bills/credit notes, since emptying the bin is itself the explicit, deliberate action that makes hard-deleting those safe to skip the warning for.

**Invoices, purchase bills, and credit notes (returns) are exempt from the 30-day auto-purge** (2026-08-11 fix, after a compliance review found the original 30-day-for-everything behavior would silently create gaps in legally-significant GST document sequences — e.g. staff deletes `PB-2026-27-0025`, creates a new bill numbered `...-0026`, and 30 days later `...-0025` vanishes from the bin with no way to explain the gap during GST filing). These three types stay in the bin indefinitely (`GET /api/bin` returns `daysLeft: -1` for them, rendered as a green "Retained (GST)" pill instead of a countdown) until an admin explicitly permanently deletes one from the Bin page — which shows an inline GST sequence-gap warning in the confirm dialog before allowing it. This is the *only* way to hard-delete one of these three types; the entity's own DELETE route (`/api/invoices/[id]`, `/api/purchase-bills/[id]`) only ever soft-deletes, and does not accept a `?permanent=true` override.

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string (`?pgbouncer=true&connection_limit=1` in production) |
| `NEXTAUTH_SECRET` | Yes | Min 32 chars random secret. Signs sessions; also derives the legacy `src/lib/crypto.ts` key when `ENCRYPTION_KEY` isn't set. |
| `NEXTAUTH_URL` | Production | Full deployed URL, e.g. `https://your-app.vercel.app` |
| `ENCRYPTION_KEY` | Optional | Dedicated key for encrypting secrets-at-rest (Gmail app password, bank account number) independently of `NEXTAUTH_SECRET`, so the two can be rotated separately. Without it, encryption still works exactly as before, keyed off `NEXTAUTH_SECRET`. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | For email sending | Gmail address + App Password, used as fallback when `BusinessSettings.gmailUser`/`gmailAppPassword` aren't set |
| `BLOB_READ_WRITE_TOKEN` | For purchase bill attachments | Vercel Blob token — auto-set on Vercel, pull locally with `vercel env pull`. Without it, attachment upload fails but everything else works. |

---

## Common Tasks

**Add a new query:**
1. Write the Prisma query directly in the GET route handler (the prevailing pattern), or add a plain helper to `src/lib/db.ts` if it belongs alongside the existing invoices/customers/products/reports helpers
2. Add `revalidateTag(tag, { expire: 0 })` calls to any mutation handlers that affect that data

**Add a new paginated list endpoint** (the established pattern for every list route added since the pagination refactor — invoices, products, brands, categories, vendors, purchase-bills, purchase-bill payments, sales payments, credit notes):
1. Add a `buildXWhere(filters)` / `buildXOrderBy(sort)` pair to a new or existing `src/lib/xQuery.ts` — never inline the filter/sort logic directly in the route handler, so the list route and its stats route can't drift
2. In the list `route.ts`, parse query params with `parsePageParams(searchParams, maxPageSize?)` and `monthYearToDateRange(month, year)` from `src/lib/listQuery.ts`, call the builder, and return `{ data, total }` (not a bare array)
3. Add a companion `stats/route.ts` under the same folder that reuses the *same* `buildXWhere()` to aggregate over every matching row — the list route's current page can no longer produce a correct total once results are paginated
4. On the client, debounce the search input with `useDebouncedValue()` from `src/lib/useDebouncedValue.ts` before it hits the API

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
⚠️ **Destructive** — wipes every table (customers/products/vendors/invoices/purchase bills/credit notes/stock movements/activity log) and every `User` except whichever account has email `dev@admin.com`, then regenerates a deterministic dummy dataset (30 products, 20 customers, 15 vendors, 70 invoices, 40 purchase bills, 8 credit notes, ~280 stock movements) spread across a fixed date range hardcoded near the top of the file, plus dummy `BusinessSettings` (name/GSTIN/PAN/bank details/address — state is set to `"Delhi"` so IGST logic has something real to compare against). Re-running it is idempotent (same seeded PRNG → identical output) — never run this against a database with real customer/invoice data without confirming with whoever owns that data first.

**First admin user (production):**
POST to `/api/setup` with `{ name, email, password }`. Refuses if any user already exists.

**Run tests:**
```bash
npm run test              # Vitest — unit tests + API integration tests (skip themselves if no test DB)
npm run test:watch        # Vitest watch mode
npm run test:coverage     # Vitest with v8 coverage (src/lib/** and src/app/api/**)
npm run test:e2e          # Playwright — full browser E2E, starts its own dev server on :3100
npm run test:e2e:ui       # Playwright's interactive UI runner
```
See **Testing** below before adding new tests — in particular, `tests/api/**` and `tests/e2e/**` need `.env.test` (copy from `.env.test.example`) pointed at a disposable database, and self-skip (Vitest) or fail every login (Playwright) without it.

---

## Testing

- **Vitest** (`vitest.config.mts`) runs two kinds of tests: `tests/unit/**` (pure `src/lib/*` functions, no DB, always run) and `tests/api/**` (imports route handler modules like `@/app/api/invoices/route.ts` directly and calls their exported `GET`/`POST`/`PUT` functions with a hand-built `NextRequest` — no HTTP server involved). `tests/e2e/**` is excluded from Vitest; Playwright owns it.
- **`.env.test`** (gitignored, copy from `.env.test.example`) must define `TEST_DATABASE_URL` pointed at a disposable database — a dedicated Neon branch works well. `vitest.config.mts` refuses to start if `TEST_DATABASE_URL` is ever equal to `.env`'s real `DATABASE_URL` (integration tests truncate every table before each test). Without `.env.test`, `tests/api/**` files self-skip via `describe.skipIf(!hasTestDatabase)` (from `tests/helpers/db.ts`) rather than running against — or silently doing nothing useful against — the wrong database.
- **API test pattern**: every `tests/api/*.test.ts` file starts with `vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));` (must be written at that file's own top level — `vi.mock` hoisting doesn't work through a shared helper) then uses `mockSession()`/`mockNoSession()` from `tests/helpers/auth.ts` to control what `requireSession()`/`requireWriteAccess()` sees, `resetDb()`/`seedUser()`/`testPrisma` from `tests/helpers/db.ts` for a clean-slate real database per test, and `jsonRequest()`/`paramsOf()` from `tests/helpers/request.ts` to build the request. `next/cache`'s `revalidateTag` is mocked globally in `tests/setup/vitest.setup.ts` (it throws outside a real Next.js request context, which is what calling a route handler directly gives you).
- **Playwright** (`playwright.config.ts`) spawns its own `next dev` on port 3100 with `DATABASE_URL` overridden to `TEST_DATABASE_URL`, and `tests/e2e/global-setup.ts` resets that database and seeds one login account (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, exported from `global-setup.ts`) before the whole suite runs. Specs share that one seeded DB/server (`fullyParallel: false`) — create whatever else a spec needs (customers, products) inside the spec itself rather than assuming another spec's data exists.
- When adding a regression test for a bug fix (see Testing Standards in the global engineering standards), prefer an API-level test over an E2E one if the bug lived in a route handler — it's faster and doesn't need a browser. Reserve Playwright for things that can only be verified through real DOM interaction (the customer/vendor/product comboboxes, modal flows, multi-step forms).
- `src/components/ui/Select.tsx` (used everywhere a `<select>`-like field appears — State pickers, etc.) is a custom trigger-button + listbox combobox, not a native `<select>` — Playwright's `.selectOption()` doesn't work on it. Interact with it as `await field.getByLabel("State").click(); await page.getByRole("option", { name: "Delhi", exact: true }).click();` — the listbox is portaled to `document.body`, so the option locator is scoped to `page`, not to whatever dialog/form contains the trigger.

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
- Edit-page routes follow `[id]/edit` (e.g. `/sales/invoices/{id}/edit`), not `edit/[id]` — standardized 2026-08-09 so every entity's edit URL nests under its detail page; keep new edit routes on this pattern
- List routes (invoices, products, brands, categories, vendors, purchase-bills, purchase-bill payments, sales payments, credit notes) moved from returning every matching row to server-side pagination (`{data, total}`), each with a companion `/stats` route for summary totals — a single page of paginated rows can no longer produce a correct total client-side
- `Invoice.balanceDue`, `PurchaseBill.balanceDue`, and `Product.isLowStock` are real Postgres `GENERATED ALWAYS AS (...) STORED` columns (not app-computed), so a cross-column comparison/derivation can be filtered/sorted server-side via a plain equality/orderBy instead of needing raw SQL per query
- `package.json`'s `build` script runs `prisma migrate deploy`, not `prisma db push` — required once real generated columns exist, since `db push`'s schema-diffing permanently conflicts with them (see Known Issues)

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
10. **Bin (Recycle Bin)** — 8 entity types (including rate lists, added 2026-08-12); 30-day auto-purge for most types (invoices, purchase bills, and credit notes are retained indefinitely — their numbers are legally significant GST sequences, see Recycle Bin section); restore or permanent-delete (admin-only, warned for the three exempt types); admin-only "empty bin" bulk purge with FK-safe ordering; `protectedReason` shown when an item can't yet be purged
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
21. **Manager role & section permissions** — Third role, read-only (`requireWriteAccess()`/`useCanWrite()` block all mutations); admins grant/revoke six `ProtectedSection` keys per non-admin user via Admin → Permissions (`SectionPermission` rows), gating overview dashboards, reports, and payment-history pages
22. **Credit notes** — Dedicated list page (`sales/credit-notes`) over all `Return` records, with its own auto-number (configurable layout/prefix/FY-based, default `CN-2026-27-0001` — same system as invoices/purchase bills, admin-configurable in Settings → Document Numbering), search/sort/pagination, PDF, and Excel export
23. **GST filing package** — `reports/gst-reports`: Sales/Purchase Register, B2B/B2C split, Credit Notes, HSN Summary, and a net-GST-payable summary for a chosen month or financial year, downloadable as a ZIP or (2026-08-12) a multi-sheet `.xlsx` workbook (`src/lib/gstFilingWorkbook.ts`); gated to admin or users with both `reports_sales` and `reports_purchases`
24. **Business branding** — Logo upload (admin-only, Vercel Blob), name/tagline shown on the sidebar, browser tab metadata, and the unauthenticated login/forgot-password pages via a public `/api/settings/branding` endpoint
25. **Manual stock adjustment** — Product detail page "Adjust Stock" action for correcting a physical stock-take discrepancy; requires a reason, writes an audited `"manual"` ledger row (`/api/products/[id]/adjust-stock`)
26. **Default-deny API middleware** — `middleware.ts` requires a valid session for all of `/api/**` except an explicit public allowlist, as a safety net alongside each route's own guard
27. **Unified low-stock definition** — `src/lib/stockStatus.ts` is the single source of truth for "out of stock" vs. "low stock" across the dashboard, reports, and every product list/detail page
28. **Server-verified inter-state GST** — Invoice create/edit independently derive `isInterState` from place-of-supply vs. the business's own configured state (`src/lib/gstLocation.ts`) rather than trusting the client-supplied flag
29. **Server-side pagination for list routes** — Invoices, products, brands, categories, vendors, purchase bills, purchase-bill payments, sales payments, and credit notes list routes now accept `search`/`sort`/`page`/`pageSize` (and `month`/`year` where applicable), each backed by a shared per-entity `buildXWhere()`/`buildXOrderBy()` helper (`src/lib/*Query.ts`) plus `parsePageParams()`/`monthYearToDateRange()` (`src/lib/listQuery.ts`); each gained a companion `/stats` route for summary totals independent of the current page, and search inputs debounce via `src/lib/useDebouncedValue.ts`
30. **DB-generated derived columns** — `Invoice.balanceDue`, `PurchaseBill.balanceDue` (`total - paidAmount`), and `Product.isLowStock` (`stock > 0 AND stock <= minStock`) are real Postgres `GENERATED ALWAYS AS (...) STORED` columns, letting a cross-column comparison be filtered/sorted server-side; required switching the `build` script from `prisma db push` to `prisma migrate deploy` (see Known Issues)
31. **Configurable document numbering + Indian Financial Year reset** — Settings → Document Numbering (admin-only) lets an admin choose the number **layout** independently for invoices, purchase bills, *and credit notes* (`NUMBER_FORMATS` in `src/lib/documentNumbering.ts`: `prefix_fy_seq` → `SH-2026-27-0001`, `seq_fy` → `18/2026-27` no prefix/no padding — matches numbering schemes businesses may already have used before switching to this app, `prefix_seq_fy` → `SH-18/2026-27`), a custom prefix per type (invoice prefix auto-derived from the business name via `deriveDefaultPrefix()` unless overridden; purchase bill defaults to `PB`, credit note to `CN`), and a one-time "next number" override per type — every field independently optional and safe to change repeatedly (always editable, confirm-dialog gated with a live rendered-example preview, logged to `ActivityLog` — no one-time lock, since existing documents are never renumbered by a later change; switching layout mid-year restarts that layout's own sequence from 1, since a differently-shaped number can't continue a prior sequence). The year segment of every generated number is a `"2026-27"`-style Indian financial year label (1 Apr - 31 Mar, via `getIndianFinancialYear()`/`formatFinancialYearLabel()`), never the calendar year, so numbering resets at the same boundary GST filing periods do. A dismissible one-time banner (`src/components/ui/InfoBanner.tsx`) nudges toward this setting on the very first invoice/purchase bill a business creates, if numbering is still untouched. Invoice/bill `date` is editable after creation (correcting a typo) but blocked from crossing into a different FY, since that would desync the date from the number already generated for it.
32. **Rate Lists** (2026-08-11) — `sales/rate-lists`: a standalone, downloadable price-sheet builder for sharing a catalog/quotation with customers (e.g. "Chemical Rate List"), free-text items (name/brand/unit/list rate/discount% or Net Rate) independent of the `Product` catalog, PDF download/preview/regenerate via the existing `generateInvoicePdfBlob()` pipeline (business logo in the header, cache keyed on `updatedAt` so edits always regenerate), email-send (`/api/send-rate-list`, mirrors `/api/send-invoice`), bulk-import of items via Excel paste or `.xlsx`/`.csv` upload (`src/lib/rateListImport.ts` + `/api/rate-lists/parse-import`) so a large supplier rate list doesn't have to be retyped by hand, and Excel export (both detail and list pages, via the existing `downloadXlsx()`/`/api/export-xlsx` infra) — no public share link or Bin restore yet (see Pending Tasks)
33. **GST-safe bin retention for numbered documents** (2026-08-11) — see the Recycle Bin section above; invoices/purchase bills/credit notes are exempt from the 30-day auto-purge and can only be permanently deleted (admin-only, warned) from the Bin page itself. (An earlier same-day iteration briefly added a permanent-delete choice at delete time on the invoice/purchase-bill pages themselves — reverted after review: it risked exactly the sequence-gap problem this fix exists to prevent.)
34. **Editable "Bill To" customer on Invoice Edit** — the customer info block on `sales/invoices/[id]/edit` has its own "Edit" link opening a modal (name/address/pincode+state with autofill/city/GSTIN/phone/email, same validation as the New Invoice and New Purchase Bill inline-customer forms) that `PUT`s `/api/customers/[id]` directly — lets a typo in the customer's saved details be fixed without leaving the invoice edit flow. Deliberately does not touch the invoice's own `placeOfSupply`/`isInterState` even if the customer's state changes — that field is independently editable on the same page and changing it automatically here could silently alter a GST calculation the user didn't intend to touch. The equivalent vendor "Edit" link already existed on Purchase Bill Edit via the shared `BillDetailsCard`, so no change was needed there.
35. **App-wide fullscreen Modal + Settings edit popups** (2026-08-14) — `Modal` (`src/components/dialogs/Modal.tsx`) gained a `variant="fullscreen"` mode (content-sized with a `max-height` cap, so a short form doesn't inherit a tall one's height) and a `footer` prop (sticky Save/Cancel outside the scrollable body) — see Key Files and the "Do not give a popup dialog its own one-off centered-box markup" rule above. All 19 Modal call sites app-wide were migrated to this, including converting the Settings page's 6 sections (Business Identity, Address, Bank Details, Terms & Conditions, Email, Document Numbering) from inline expanding forms — which used to push the page layout and, on mobile, auto-scroll to the newly-expanded section — into this fullscreen popup. Also fixed: the invoice detail/PDF's Transportation Charges row had its GST-rate percentage cells right-aligned instead of center-aligned like every other row's percentage column (`sales/invoices/[id]/page.tsx`, same DOM the PDF renderer captures).
36. **Full-app audit, all 14 phases (2026-08-18 → 2026-08-21, committed `66177dc`)** — see `docs/SCIENCE_HUB_AUDIT_STATE.md`/`docs/SCIENCE_HUB_AUDIT_REPORT.md` for the complete finding-by-finding record; summary of what actually changed in the app:
    - **Security**: `find-email` substring-enumeration closed (exact match only); SMTP header-injection closed on `send-invoice`/`send-rate-list` (`\r`/`\n`/length-capped `invoiceNumber`/`title`); blob-URL validation tightened to an exact store-hostname match (see `blobStorage.ts` above); business-logo blob cleanup moved server-side into `PUT /api/settings`.
    - **Data integrity / business logic**: `PUT /api/invoices/[id]` and `PUT /api/purchase-bills/[id]` no longer trust an arbitrary client-supplied `status` (recomputed from `paidAmount`/`total`, purchase-bills' `"cancelled"` still trusted verbatim as the one legitimate direct value); `stock` is now rejected server-side on product edit (see the "Do not" rule above); purchase bills gained the duplicate-product-line guard invoices already had; same-day payment/return date bug fixed (`toIstDateStr()`, see above); New Invoice's Transport Charge toggle defaults on, New Purchase Bill's defaults off (matches real usage — confirmed against production data).
    - **Dependencies**: removed unused `@auth/prisma-adapter` (pulled in 3 critical `@auth/core` CVEs for zero functionality — app is `CredentialsProvider`-only); `next` `16.2.9`→`16.3.1`, `nodemailer` `7.0.13`→`9.0.5`, plus a non-breaking `npm audit fix` batch — `npm audit` went from 15 vulnerabilities (3 critical/6 high) to 2 accepted-moderate.
    - **Performance/scale**: bin purge routes, dashboard 12-month breakdowns, and `getReportSummary()` batched instead of N+1/sequential; dashboard "top 5 customers/vendors" and outstanding-balance aggregates moved to DB-side `groupBy`/`aggregate()` instead of fetching every row into JS.
    - **Resilience**: added `(dashboard)/error.tsx` + `global-error.tsx` (see above); `ifsc-lookup` no longer conflates a real upstream outage with "not found" (matches `pincode-lookup`'s existing pattern); explicit SMTP timeouts on `send-invoice`/`send-rate-list`.
    - **Accessibility**: skip-to-main-content link; 3 icon-only buttons gained `aria-label`s; `FormField` now wires `aria-describedby` to its error/hint text; a light-mode contrast gap and a previously-unknown dark-mode sidebar/active-tab contrast bug both fixed.
    - **Other**: `src/app/robots.ts` added (disallows all crawling — the app is 100% internal/auth-gated); `documentNumbering.ts`/`rateListForm.ts` gained unit tests (unit suite 54→99 passing); PDF multi-page item-duplication/page-number-stamp bug and a related footer-border artifact fixed in an earlier pass but reverted per the user's own request (Phase 5 in the state doc explains why it's marked complete despite the fix not landing — the user's own separate PDF rewrite superseded it).
    - **Still open** (see the state doc's "Next Exact Action"): no test database ever provisioned, so `tests/api/**`/`tests/e2e/**` have never actually executed against a real DB; this audit's own fixes shipped without new regression tests for the same reason.
37. **Mobile breakpoint pass (v1) + list pagination/refetch UX** (2026-08-14) — a broader mobile-responsiveness retrofit alongside the Modal migration: the sidebar/topbar mobile-drawer threshold widened from `768px` to `1024px` (`DashboardShell.tsx`'s `isMobile()`/`check()`, `DashboardShell.module.css`, `GlobalSearch.module.css` — see Key Files), the separate form-field compact-mode breakpoint was standardized to a consistent `768px` everywhere (`Input`/`Select`/`DatePicker`/`PasswordInput`/`PhoneInput`/`Toast` `.module.css` files, previously an inconsistent 767/768 mix), and `Button` gained a `@media (max-width: 640px)` tier that shrinks padding/font-size per size class (`sm`/`md`/`lg`/`full`) so toolbar buttons don't overflow on phone widths. Separately, `Pagination` (`src/components/ui/Pagination.tsx`) gained a `loading` prop (disables Prev/Next while a page's data is still in flight) and its Prev/Next handlers now blur the clicked button before calling `onPage()`, then `scrollIntoView({behavior:"smooth", block:"start"})` on the nearest `.animate-card` ancestor — otherwise a page change on a long list leaves the user scrolled down past table rows that just changed under them with no visual cue anything happened (button blur is required first: a still-focused element that becomes `disabled` on the next render gets its focus force-cleared by the browser, which fires its own scroll adjustment that cancels the smooth one). The same scroll-to-top-on-page-change idea is hand-rolled in `admin/page.tsx`'s activity-log pagination (not on the shared `Pagination` component), so treat it as the app's general pagination convention, not something unique to one component. `Spinner.tsx` gained `FloatingSpinner` — a bare spinner fixed to the viewport center with a translucent scrim and no card, for dimming content that's still visible during a background refetch (as opposed to `OverlayLoader`'s solid card, meant for blocking a whole page/modal during a save) — currently used only on `sales/invoices/page.tsx` (`isRefetching = loading && !!data`, dims the table to 50% opacity and disables `Pagination` while refetching a new page/filter without dropping back to the full-table skeleton).

38. **Input length-bound validation** (2026-08-18) — `src/lib/validation.ts`'s `rules.*` and every per-entity `validateXInput()` gained server-side min/max length checks (name, address, city, bank fields, password) alongside the existing format rules, matching the client `FormField`s so a create/edit route can no longer be reached with an empty/oversized/whitespace-only value that its own form UI already blocks.
39. **Drag-to-reorder line items, product bulk import** (2026-08-20) — Invoice/purchase-bill/rate-list item tables support drag-to-reorder; Products gained bulk import from Excel/CSV (mirrors the Rate List import pattern — see `src/lib/rateListImport.ts` for the shared parsing approach). `ConfirmDialog` now portals to `document.body` (was rendering trapped inside a transformed ancestor); admin's activity log uses the shared `Pagination` component.
40. **Shared toolbar components + mobile breakpoint pass (v2)** (2026-08-25) — `SearchField`, `DateRangeFilter`, `HeaderActionsRow`, `ToolbarField` extracted and rolled out across every list/report page toolbar, replacing per-page hand-duplicated markup; `Spinner` overlays now portal to `document.body` like `ConfirmDialog` already did; form-control mobile heights synced across `Button`/`Input`/`Select`/`DatePicker`/`PasswordInput`/`PhoneInput`. Dashboard bar-chart value labels now float above each bar's own top (84% max-height scale, hover badge) instead of a shared fixed row that clipped against `chartScroll`'s overflow interaction.
41. **Cache-invalidation, idempotency, and data-integrity hardening** (2026-08-26, commit `76412b3`) — `bustCachePrefix()` now also matches `` `${prefix}/...` `` sibling sub-paths (a systemic gap: busting `/api/invoices` previously missed `/api/invoices/stats`, `/api/invoices/payment`, etc. — see `src/lib/useCache.ts`), with missing cache-bust calls added across payment/return/delete/edit/cancel flows and brand/category rename. Purchase Bill edit gained the same in-transaction optimistic-concurrency recheck Invoice edit already had. Client-generated, parent-resource-scoped **idempotency keys** (`src/lib/useIdempotencyKey.ts`) now guard Invoice/PurchaseBill/Payment/PurchasePayment/Return creation against retried/duplicated submissions (409 on a genuine key collision across two different parents, never a silently dropped payment). GST Summary and Purchase-by-category now aggregate in the database instead of in-memory; Bin's GST-retained types (invoices/purchase bills/credit notes) are capped per request with a "Load more" control instead of always fetching full history. See [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) Era 12.6 for the full list.

---

## Current Work In Progress

Nothing actively in progress on the committed branch as of 2026-08-31 (last commit `baef4f2`, 2026-08-27 — a 404-unguarded-fetch fix on purchase bill/vendor pages).

**Uncommitted working-tree changes** (verify against `git status`/`git diff` before trusting this, per [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) Era 13): CSV/XLSX export formula-injection hardening — a new `src/lib/formulaSafety.ts` (`neutralizeFormulaCell()`) wired into `gstFilingWorkbook.ts`, `gstFilingZip.ts`'s CSV writer, and `xlsxExport.ts`, so a cell value starting with `=`/`+`/`-`/`@` can't be evaluated as a formula by Excel on open — plus a stock-adjustment preview (current/delta/new-stock) on the Product detail page's Adjust Stock dialog, and small CSS/copy tweaks to the GST filing date filters and a few form fields.

---

## Pending Tasks

- Verify email send flow end-to-end: Settings → configure Gmail → invoice detail → send button → customer inbox
- Test forgot-password full flow in production (requires `NEXTAUTH_URL` set correctly on Vercel)
- Test bin restore/permanent-delete and empty-bin for all 8 entity types
- **Provision a real test database** and copy `.env.test.example` → `.env.test` — the `tests/api/**` and `tests/e2e/**` suites are written and pass type-checking/lint, but have never been run against a live database (no test DB was available at authoring time). Run `npm run test` and `npm run test:e2e` once `.env.test` exists to confirm they actually pass, not just compile.
- Expand test coverage further (this line was stale as of 2026-08-21 — `purchase-bills`, `purchase-bill-payments`, and `returns` all gained real integration-test coverage since it was last written; re-verified by reading `tests/api/*.test.ts` directly rather than trusting this note). Current state: unit-tested (`src/lib/validation.ts`, `invoiceCalc.ts`, `roundOff.ts`, `gstLocation.ts`, `stockStatus.ts`, `purchaseBillForm.ts`, `listQuery.ts`); integration-tested (`customers` POST/PUT, `vendors` POST/PUT, `invoices` POST only, `bin` GET + invoice/purchase-bill restore only, `purchase-bills` POST/PUT/DELETE, `purchase-bill-payments` POST, `returns` POST/DELETE). Still genuinely untested: `brands`/`categories`/`products`, `rate-lists`, `credit-notes` (the list route itself — `returns.test.ts` covers creating/deleting the underlying `Return` rows, not `GET /api/credit-notes`), sales `payments` (the invoice payment sub-route — only invoice *creation* is tested), `settings`, `admin/*`, `search`, `send-invoice`/`send-rate-list`, `gst-filing`, `export-xlsx`, and `bin`'s permanent-delete/`empty` routes. `tests/api/**`/`tests/e2e/**` have still never actually been run against a real database (no test DB provisioned as of this note) — only confirmed to compile/self-skip correctly.
- **Rate Lists follow-up phases** (deferred from the 2026-08-11 MVP by deliberate scope choice; email-send shipped via `/api/send-rate-list`, Bin restore/permanent-delete shipped 2026-08-12 — see Recycle Bin section): a public token-based share link so a customer can view/download without logging in (`RateList.shareToken`-style, rate-limited, added to `middleware.ts`'s public allowlist) is the only gap remaining
- Wire up `FormField`/error-state UI for `RateListItemsTable`'s paste-import (currently `validate()` runs but shows no field-level error — a silent no-op on empty submit / toast-only fallback) — needed before its submit button can drop the `.trim()` disable guard per the new/create-form convention above (2026-08-14). (`categories`/`brands` page Add & Rename modals had this same gap — fixed 2026-08-14.)

---

## Known Issues

- ~~Theme flicker on initial load~~ — actually already fixed: `src/app/layout.tsx` has a pre-hydration inline script + `suppressHydrationWarning` that sets `.dark`/`--c-accent` before paint. This note was stale; leaving it struck through rather than silently deleting it in case there's a regression to watch for.
- After schema changes (`prisma migrate dev`), must stop dev server → `npx prisma generate` → restart. The generated client DLL is locked while the server is running.
- `package.json`'s `build` script runs `prisma migrate deploy` (applies committed migration files), not `prisma db push`. `db push` diffs the schema against the live DB and will permanently fail once a real Postgres `GENERATED ALWAYS AS (...) STORED` column exists (`Invoice.balanceDue`, `PurchaseBill.balanceDue`, `Product.isLowStock`) — Prisma's `@default(dbgenerated(...))` can't express a true stored-generated column, so `db push` always sees a false diff and tries to `ALTER COLUMN` a column Postgres won't let it touch. Always add new schema changes via `prisma migrate dev --name ...` (committed migration file), never rely on `db push` in this repo.
- `payment/[paymentId]` PUT (edit payment) previously had no database transaction, unlike every other money-mutating flow — fixed to use the same Serializable transaction + P2034 retry pattern as payment creation.
- Running `npm run dev` and then `npm run build` in the same `.next` folder can fail type-checking with `Module '"./routes.js"' has no exported member 'AppRouteHandlerRoutes'` inside `.next/dev/types/validator.ts`. That file is Turbopack dev-mode's own route-type-checking scaffold, generated only while `next dev` runs; Next.js auto-appends `.next/dev/types/**/*.ts` to `tsconfig.json`'s `include` every time `next dev` starts (don't try to remove that entry by hand — Next just re-adds it verbatim, reformatting the whole file in the process), so a stale copy left behind from a previous `dev` session gets type-checked against the fresh `next build`'s incompatible output and fails the whole build. Fixed at the root: `package.json`'s `prebuild` script (`node -e "require('fs').rmSync('.next/dev', { recursive: true, force: true })"`) deletes that stale directory before every `npm run build`, so this can no longer recur — no manual `rm -rf .next` needed before building.
- Local `npm run build`/`prisma migrate deploy` intermittently threw `P1001: Can't reach database server` against Neon even though raw TCP/TLS to the same host succeeded every time (verified with plain `net.connect` and `openssl s_client`) — two separate causes, both fixed 2026-08-21: (1) the local `.env`'s `DATABASE_URL` had `channel_binding=require`, which Prisma 5.22's bundled TLS stack doesn't negotiate the way Neon's endpoint expects — removed it (kept `sslmode=require`); (2) Neon's free-tier compute auto-suspends on idle and its cold-start-to-ready sometimes exceeded Prisma's default connect timeout, causing a real-but-transient failure on the first request after a suspend — added `connect_timeout=30` to `DATABASE_URL`. As a second line of defense (this can still recur on Vercel's own build, since Vercel hits the same Neon cold-start), the `build` script no longer calls `prisma migrate deploy` directly — it runs `node scripts/migrate-deploy-retry.js` (up to 5 attempts, 5s apart) first, then `next build`. If a schema-changing PR ever needs a *different* migrate invocation, edit that script rather than reverting to a bare `prisma migrate deploy` in `package.json`.

---

## Deployment Notes

- Hosted on Vercel
- `postinstall` in package.json runs `prisma generate` — do NOT remove
- Use pooled Neon URL with `?pgbouncer=true&connection_limit=1`
- `NEXTAUTH_URL` required in production env vars on Vercel
