# Science Hub — Development Log (2026-06-21 → present)

Full history of the app from the very first commit to today, in one file. Purpose: so a future session (human or AI) can see *what* was built, in what order, *why* things changed shape along the way, and — most importantly — *the working conventions this codebase has settled into*, without having to re-derive them from scratch or re-discover the same bugs twice.

Organized as chronological eras (grouping related commits), each with what shipped and what it was fixing. The final section is the most recent working session, written in more detail since it's fresh, plus two reference sections (**Conventions** and **Operational Notes**) that matter more than any individual commit.

---

## Era 1 — Genesis (2026-06-21 → 2026-06-23)

`0f48fad` Initial commit → `81db43d` bin functionality.

Core CRUD scaffolding: invoices, customers, products, categories, brands. Admin panel with staff activity access. Recycle bin. Early UI bugs fixed as they surfaced: theme-change background flicker, activity log not writing on the live build, avatars not showing on mobile, a shared loader component introduced to replace ad-hoc spinners.

## Era 2 — Auth, validation, first real bugs (2026-06-24 → 2026-06-27)

Gmail settings + forgot/reset-password + find-email flow. A `getServerSession`/`authOptions` typing fix that had been silently breaking builds. Customer validation tightened (name+phone required). Invoice button ordering, stock badge wrapping, mobile card blank-space fixes across every table page.

Then the first substantial feature: **stock deduction wired into the invoice lifecycle** — create/edit/delete/restore all adjust stock, with negative-stock warnings and an out-of-stock confirmation popup before the write happens. **Item returns** (credit notes, though not yet called that) introduced alongside it: record a return, restore stock, show return history with a timestamp on the invoice detail page. PDF logo rendering fixed on mobile. Orange badge variables added for the new return-related activity-log entries.

## Era 3 — Purchases module born (2026-06-30)

One very large day. In order:
- Real-time email-uniqueness + password validation on the Add User form.
- Full-text search across every visible field in the Recycle Bin.
- **`Vendor` and `PurchaseBill` data models + full REST API** — the whole Purchases side of the app starts here.
- Vendor and Purchase Bills UI pages, added to the sidebar.
- **Sidebar/module restructure**: grouped nav, new dashboards, reports, payments pages — the Sales/Purchases split that the app still has today starts taking shape here.
- Vendor detail page, topbar bin label, dashboard `setState`-in-`useEffect` antipattern removed.
- Purchase bill edit page, redesigned bill detail UI, dashboard quick actions.
- **AI bill scan upload** (Claude Haiku, then swapped to Gemini 1.5 Flash for cost, then to `gemini-2.0-flash` for a model-name fix) + a "Pay Full" button on the bill detail page.
- Inline vendor creation + "save to catalog" for bill line items that don't match an existing product.
- Toast-based validation adopted everywhere, replacing in-form banner errors (`STRUCTURE.md` added as a developer reference around the same time).
- **The AI bill scan feature was removed** shortly after shipping (`08eaf16`) — the same commit that finished the toast-validation rollout. (Worth knowing if it's ever asked for again: it existed, worked, and was deliberately pulled — check that commit before re-adding it, rather than assuming it was never tried.)

## Era 4 — Dashboard redesign, security, caching (2026-07-01 → 2026-07-09)

Dashboard routes consolidated under one shared `(dashboard)` layout to stop the sidebar remounting on every navigation. Sidebar/dashboard UX redesign; invoice PDF generation unified with Original/Duplicate copy stamping (one PDF pipeline instead of two).

Two dedicated **security audit** passes (`391441d`, `126dad5`), followed by a fix commit addressing what they found: security/data-integrity bugs, optimistic caching added, spurious global loaders removed. Then a second hardening pass: purchase-bill/invoice transaction timeouts, a GST trust-boundary issue (client-supplied tax data being trusted server-side — the precursor to today's `deriveIsInterState()` pattern), and assorted UI loading-state bugs.

Global search shipped across invoices/customers/products/vendors/purchase-bills. Bin and activity-log bulk-clear tools added. Purchase-bill "catalog flow" (matching scanned/entered items to existing products) refined. Invoice place-of-supply, reverse-charge, and delete UX improved.

## Era 5 — Bank details, discounts, branding, first sort/pagination work (2026-07-10 → 2026-07-13)

Bank details (PAN/IFSC/account number, with IFSC lookup) added to Business Settings — the ancestor of today's encrypted bank fields. Server-side validation hardened across products/users/invoices/purchases. Invoice and purchase-bill detail pages reworked.

Line-item discounts added to purchase bills (schema + API + UI) alongside a new shared `SortSelect` component rolled out across most list pages — the first move toward what would later become full server-side pagination. An admin bulk-clear endpoint for the stock ledger. Business logo upload/branding shipped, with page-load animations. A quick fix so clicking "low stock" on the dashboard jumps straight to the filtered product list. Several `chore:` deploy-trigger commits around this time reflect Vercel env-var/blob-token propagation issues, not code changes.

## Era 6 — Branding revamp, permissions, ledger types, GST hardening, pagination overhaul (2026-07-15 → 2026-07-27)

- Business branding + PDF revamp; DB indexes added. Purchase-bill stock double-reversal on cancel+delete/restore fixed. Payment edits capped at the invoice balance (can't record a payment edit that overshoots what's owed). Product cache busted after bill stock changes. A dead invoice breadcrumb link fixed. `revalidateTag` added to the stock-ledger clear endpoint; a `NaN` guard added to activity-log pagination.
- **Manager role with section-level permissions** shipped (`ddac309`) — the third role, read-only, gated per-section (`SectionPermission` model) that's still the access-control model today. Invoice logo toggle added alongside it.
- Brand/Category `updatedAt` push failures fixed; Settings section saves decoupled from each other (the ancestor of today's "each Settings card saves independently" pattern — see Conventions).
- Invoice PDF column widths and bank-detail bold-text fixed; place-of-supply `<select>` no longer collapses when empty.
- **Stock ledger "adjustment" split into specific transaction types** with a `documentType` column (`7a63dbb`) — replacing one generic catch-all with the specific `StockMovementType` union the codebase still uses (`sale`, `sale_edit_reverse`, `purchase`, `return`, `manual`, etc. — no generic type since this commit).
- **GST inter-state verified server-side** and **every API route gated by default** (`358ec09`) — this is the commit that introduced the default-deny `middleware.ts` pattern still governing every route today, plus the first version of server-side `isInterState` derivation that `deriveIsInterState()` continues.
- Form validation UX standardized (`noValidate`, per-field `FormField` errors, a `PhoneInput` with country code) across customer/vendor/invoice/purchase-bill/reset-password forms — the origin of the "gold-standard form" convention `admin/page.tsx` still models today.
- Inter-state GST tracking (CGST/SGST/IGST split) + HSN codes added to purchase bills, with the PDF item table redesigned into the unified vendor-style layout (merged Discount/Taxable/GST breakdown) still in use.
- **Every list page converted from fetch-everything-then-filter-in-JS to real server-side pagination/search/sort/stats** (`a6011b4`) — Invoices, Purchase/Sales Payments, Purchase Bills, Credit Notes, Stock Ledger, Products, Customers, Vendors, Brands, Categories, all in one pass. This is the commit that established the `buildXWhere()`/`buildXOrderBy()` + companion `/stats` route pattern every list route still follows.
- A same-day follow-up fix: customer/product/vendor dropdowns on invoice/purchase-bill new/edit pages broke because they still expected the old bare-array response shape — unwrapped `.data` and requested `pageSize=5000` to get the full set back. (Worth remembering: any UI that needs an *entire* collection, not a page of it, has to explicitly ask for a large `pageSize` now that list routes paginate by default.)
- Stale Turbopack dev-mode types breaking production builds — fixed at the root with the `prebuild` script that deletes `.next/dev` before every build (still the fix in place; see Known Issues in `CLAUDE.md`).
- A pre-commit hook added that blocks `schema.prisma` changes without a matching migration file.

## Era 7 — Modals, skeletons, pre-handover audit (2026-07-29 → 2026-08-09)

Inline forms converted to popup modals; productless invoice line items (custom items with no linked product) allowed; dead CSS cleaned up. Loading skeletons synced with mobile responsive column attributes.

Pincode-lookup autofill added; full contact/address required on customer and vendor records; quick-add/state-select correctness bugs fixed. Then a dedicated **pre-handover audit** pass (`81d3454`) fixing money-math, access-control, and validation bugs found in review — the kind of pass worth re-running before any future handover. Invoice PDF item-table font shrunk, Discount % header wrapped. **Edit routes standardized to `[id]/edit`** (not `edit/[id]`) across every entity — the routing convention still followed. Stale invoice/purchase-bill PDF caching fixed on customer/vendor/settings updates; Sales-vs-Purchases wording standardized; HSN input added to the purchase-bill quick-add item; a confirm-before-save dialog added to vendor edit.

## Era 8 — Configurable document numbering (2026-08-10, commit `651a619`)

The first commit of the current numbering system: invoice/purchase-bill numbers become admin-configurable (custom prefix, one-time "next number" override) and reset on the Indian financial year (1 April), not the calendar year. Full detail in the session section below, since most of the *design* iteration on this feature happened in conversation immediately after this commit landed, not in the commit itself.

---

## Era 9 — This session (2026-08-10 → 2026-08-11, mostly uncommitted as of writing)

### 9.1 — Document numbering, taken further

What `651a619` shipped was a starting point; this session's early work refined it in response to a real scenario: the business already had ~18 invoices numbered manually (`18/2026-27` — sequence/FY, no prefix, no padding) in a different system before switching to this app, and the app's own `SH-2026-0019` format didn't match.

- `src/lib/documentNumbering.ts` grew a **layout registry** (`NUMBER_FORMATS`) instead of one fixed shape: `prefix_fy_seq` (`SH-2026-27-0001`, this app's original format), `seq_fy` (`18/2026-27`, matching the business's existing scheme), `prefix_seq_fy` (`SH-18/2026-27`). Each entry pairs a `render()` with a `matcher()` regex, because once the sequence isn't guaranteed to be the number's fixed last segment (`seq_fy` puts it *first*, and deliberately doesn't zero-pad — so a plain string sort would rank `"10/…"` before `"9/…"`), finding "the highest number so far" means regex-matching every candidate row in JS (`findMaxSequence()`), not `ORDER BY … DESC LIMIT 1`.
- **The default layout was changed mid-session from `prefix_fy_seq` to `seq_fy`** once it became clear that's what most businesses already have on paper before adopting this app.
- `BusinessSettings` gained, independently per document type (invoice / purchase bill / **credit note**): `{type}NumberPrefix`, `next{Type}NumberOverride`, `{type}NumberFormat`. All nullable, all optional, the "next number" always one-time-use (cleared to `null` the instant a create consumes it, so it can't silently reapply to a later document).
- Settings → **Document Numbering** card: a format dropdown + prefix + one-time override per type, with a live rendered-example preview, a confirm dialog before saving, and an `ActivityLog` entry. Deliberately **no lock** — repeated edits are safe because a number, once generated, is never retroactively touched.
- A dismissible one-time banner (`InfoBanner.tsx`) nudges toward this setting on a business's very first invoice/purchase bill, if numbering is still untouched.
- **Credit notes** (`Return.creditNoteNumber`) got the same treatment after an explicit audit found they'd been left on the old calendar-year, hardcoded-`CN` logic — the exact bug the FY-reset fix had already solved for invoices/bills, just not yet ported to returns.
- Three migrations, hand-written (see Operational Notes) — `add_document_numbering_config`, `add_document_number_format`, `add_credit_note_numbering_config`.

### 9.2 — `date` becomes editable on invoices/purchase bills, with a guard rail

Once a document's number is permanently tied to the FY its `date` fell in at creation, `date` still needed to be *correctable* (the user wanted to fix a same-week typo — created on the 8th, should say the 10th). `/api/invoices/[id]` and `/api/purchase-bills/[id]` now accept a `date`/`billDate` update, rejecting a future date and — the actual point — **rejecting a date that would move the document into a different financial year than the one its number already encodes.** Mirrored client-side for instant feedback. `InvoiceOptionsRow` gained an *optional* invoice-date field, rendered only on the Edit page (not New, where the date is always "now" and never user-set).

### 9.3 — Rate Lists: layout + PDF + sharing polish

The Rate List feature (list/detail/new/edit, API, PDF template) already existed going in; this session:
- Restyled New/Edit to the same left/right-column layout as New/Edit Purchase Bill, via a new `RateListFormBody` component — same breakpoint, same sticky right column, right column shows an item count instead of a totals box (rate lists have no GST/discount total).
- Removed a `Generated {date}` line from the printed PDF (`RateListPrintArea.tsx`).
- Share menu: `Download` → `Email`, matching the Invoice detail page's Share menu exactly. Since a rate list has no linked customer to source a recipient from, `Email` opens a small `Modal` asking for the address, then posts to a new `/api/send-rate-list` route (a near-copy of `/api/send-invoice`'s Gmail/`nodemailer` logic).

### 9.4 — Systemic bug: "toast fired, but the form was still editable"

**The report**: after saving an invoice edit, the success toast appeared, but for a few seconds the Edit page still looked live — Save enabled, fields editable — before actually navigating away.

**Root cause, found repeated across many files**:
```js
const res = await fetch(...)
setSaving(false)              // unlocks the UI immediately
if (res.ok) {
  const d = await res.json()  // still async work ahead
  toast(success)
  router.push(...)            // navigation hasn't started yet
}
```
Between the reset and the actual `router.push`, the page re-renders fully interactive while unrelated async work is still in flight and nothing has navigated yet — a second click or an edit in that window acts on a page that's already stale.

**Fix, applied everywhere this shape was found**: never reset the loading flag on a path that ends in navigation; leave it `true` until the page unmounts, and only reset it on the *failure* path (so a failed save stays retryable).
```js
if (res.ok) {
  const d = await res.json()
  toast(success)
  // deliberately no setSaving(false) here
  router.push(...)
  return
}
toast(error)
setSaving(false)
```
**Fixed in**: Invoice Edit, Invoice New, Customer New, Vendor New, Product New, Categories (rename flow), and (consistency-only, not an observable bug) Product detail's adjust-stock popup.

**Checked and already safe**: any flow where the interactive element closes *synchronously*, in the same tick as the flag reset — every delete-confirm flow in the app, the three Invoice-detail popups (Payment/Return/Delete Return), the Purchase-Bill-detail Payment popup, and every quick-add Customer/Vendor/Product modal. Nothing left on screen to misuse, even though the reset technically preceded some unrelated `await`.

### 9.5 — Systemic bug: dialogs escapable mid-save

Found while auditing 9.4. The shared `ConfirmDialog` disabled its Cancel **button** while `loading`, but its Escape-key and backdrop-click handlers called `onCancel()` unconditionally — bypassing that lock. Fixed once in the shared component, which fixed it for every delete/confirm dialog in the app at once:
```diff
- if (e.key === "Escape") { onCancel(); return; }
+ if (e.key === "Escape") { if (!loading) onCancel(); return; }
- <div className={styles.backdrop} onClick={onCancel} />
+ <div className={styles.backdrop} onClick={() => { if (!loading) onCancel(); }} />
```
The generic `Modal` component (distinct from `ConfirmDialog`, used for Add/Rename/Email-style dialogs) has no built-in `loading` concept — each caller guards its own `onClose`. Categories, Brands (Add/Rename modals) and Admin (Add/Edit User modals) hadn't; fixed the same way (`onClose={() => { if (!savingFlag) close(); }}`).

### 9.6 — Settings page overlay consistency

Only Branding/Logo showed a full-page `OverlayLoader` while saving; every other Settings section (Identity, Address, Bank, Terms, Email, Document Numbering) only disabled its own button. Not a bug — nothing stayed editable that shouldn't have — but inconsistent with the rest of the app (see Conventions below). Replaced the narrow `brandingBusy` flag with one covering every section.

### 9.7 — Rate List Email modal: field not disabled during send

Smaller, specific version of 9.4/9.5's family: the "Recipient Email" input in the new Email-share modal had no `disabled={sendingEmail}` at all, so it stayed editable while the request was in flight. Fixed directly, and an `OverlayLoader` added to the modal for consistency with the rest of the app.

---

## Conventions (read this before touching a save/create/delete flow)

- **`OverlayLoader` (`src/components/ui/Spinner.tsx`, `position: fixed; inset: 0; z-index: 9999`) is how this app locks a page or modal during an async action** — not a pile of per-field `disabled` props. Its z-index sits above everything, including an open `Modal`, so it blocks pointer interaction with whatever's underneath regardless of that content's own disabled state. Reach for it on any new save/create flow, gated on that flow's own `saving` boolean.
- **Escape and backdrop-click are separate code paths from a dialog's visual overlay coverage** and need their own guard against a `loading`/`saving` flag — a disabled Cancel button alone doesn't stop Escape from calling the same handler.
- **Never reset a "saving" flag on a success path that ends in `router.push`** — leave it `true` until the page actually unmounts; only reset on the failure path.
- **Settings sections each save independently** — a save action must only touch, validate, or send the fields for the section actually being edited, never the full form state, so a broken value in one section (e.g. an undecryptable bank account number) can't block saves anywhere else. This dates back to Era 6 (`8b46a41`) and every Settings card since has followed it.
- **List routes are paginated by default** — anything that needs a *whole* collection (a `<select>` full of every customer, say) must explicitly request a large `pageSize`, not assume the old bare-array response shape.
- **`admin/page.tsx` is the reference implementation for a form**: `noValidate`, no `required` prop on `Input`/`Select` (triggers the browser's own validation bubble instead of the app's), per-field `FormField` errors (not a banner or a toast for validation — toasts are for save success/failure), Save button disabled on every mandatory-field-empty check plus the dirty/saving flags.
- **A document number, once generated, is permanently tied to the financial year (Apr–Mar) its `date` fell in** — any future edit surface on `date`/`billDate` must reject a change that crosses that boundary, the same way the Invoice/Purchase-Bill edit routes do today.
- **Server-derived facts are never trusted from the client** — `isInterState`, GST splits, totals, and now the FY a document belongs to are all recomputed/verified server-side regardless of what the client sends. This goes back to the Era 4 GST trust-boundary fix and has held ever since.

## Operational Notes

- **`prisma generate` fails while the dev server is running** (`EPERM` on the query-engine `.dll.node`) — stop the dev server before any schema change. A generate that races the dev server can leave the client *half-generated* (TS types updated, the embedded runtime `schema.prisma` snapshot stale) — after any retried generate, verify `node_modules/.prisma/client/schema.prisma` actually contains the new columns, don't just trust a "success" message.
- **`prisma migrate dev` doesn't work in a non-interactive shell** — migrations get hand-written as a timestamped `migration.sql` and applied with `prisma migrate deploy`.
- **The local `.env` database is not the live/production one** — it holds what looks like the seed script's deterministic dummy data (dozens of rows), not the small number of real rows a live business would have. Confirmed more than once. Any lookup/edit of specific real records has to go through the user directly (Neon console, psql) — never assume a local Prisma query is hitting production.
- **Windows + `npm run build`'s `prebuild` step can `ENOTEMPTY` on `.next/dev`** if the dev server is running concurrently — same root cause as the Prisma one. `npx tsc --noEmit` + targeted `eslint <file>` is an acceptable stand-in when a full build can't run for this reason, *provided* no schema/migration change is part of what's being verified.
- A pre-commit hook blocks `schema.prisma` changes without a matching migration file — don't try to bypass it; write the migration.
