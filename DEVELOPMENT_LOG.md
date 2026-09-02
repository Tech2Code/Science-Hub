# Science Hub — Development Log (2026-06-21 → 2026-09-02)

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

## Era 9 — This session (2026-08-10 → 2026-08-11)

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

## Era 10 — Transport charges, Rate List bulk-import, GST filing XLSX, login DB-error safety (2026-08-11 → 2026-08-12)

### 10.1 — `d83b21f`: Rate List bulk-import + Excel export

Era 9.3 only covered Rate Lists' *layout/PDF/sharing* polish; this commit adds a genuinely new capability on top — retyping a 60+ row supplier rate list by hand was the actual complaint. Two entry points feed one parser:
- **Paste from Excel** — a `Modal` with a `Textarea`, parsed entirely client-side (an Excel range copy is tab-separated between columns, so no server round-trip is needed).
- **Upload .xlsx/.csv** — posts to the new `/api/rate-lists/parse-import`, which does the same job server-side after ExcelJS reduces the sheet to plain string rows.

Both funnel through `parseRateListRows()` (`src/lib/rateListImport.ts`), which **detects a header row by column-name matching** (`Name`/`Brand`/`Unit`/`Discount`/`List Rate`, any order/casing, via a `COLUMN_PATTERNS` list checked top-to-bottom so `list rate` doesn't get eaten by the looser `amount`/`rate` catch-all) and **falls back to a positional guess by column count** when fewer than 2 columns are recognized — 7 columns assumes the "S.No, Chemical, Brand, Unit, Discount, List Rate, Amount" shape a supplier's own printed rate list commonly uses, 5 columns assumes the app's own item order (Name, Brand, Unit, Discount, List Rate). Parsed rows are **merged into the form's existing items state**, replacing only the still-empty scaffold rows rather than saving directly — same review-before-save step as a manually-typed row gets, and importing into a fresh form doesn't leave a stray blank row behind.

Both the detail and list pages can also now **export a rate list's items to `.xlsx`**, reusing the app's existing generic `downloadXlsx()` + `/api/export-xlsx` infra (already used by Credit Notes/Sales/Purchase Reports) — no new export endpoint needed, just the column mapping. Fixed in the same commit: Export previously only showed a small inline button spinner during the async call, easy to miss; it now gets the same full-page `OverlayLoader` every other save/export flow in the app already uses (see Conventions).

### 10.2 — `e379026`: Transportation charge on invoices/bills, GST-safe bin retention ships, inline Bill-To customer edit extended

**Transportation charge** is a new set of three plain columns on both `Invoice` and `PurchaseBill` (`transportCharge`, `transportChargeGstRate`, `transportChargeGstAmount`, migration `20260811114859_add_transport_charge`) — not a line item, and deliberately **not folded into `cgst`/`sgst`/`igst`** (which stay a pure sum of item-level tax) or into whichever item tax-rate bucket happens to match. It's a productless service charge (freight, etc.) that gets its own line on the printed document with its own GST split, and adds straight into the grand total. `computeInvoiceTotals()`/`computePurchaseBillTotals()` (`src/lib/invoiceCalc.ts`/`purchaseBillForm.ts`) both gained optional `transportCharge`/`transportChargeGstRate` params for this; `transportChargeGstAmount` is always server-recomputed from `charge × rate`, never trusted from the client — same trust-boundary posture as `isInterState`. `gstFiling.ts`'s invoice total-consistency check (`subtotal + tax + roundOff === total`) had to grow the transport terms too, or every invoice carrying one would fail that GST-filing sanity check as a false positive.

On the printed invoice PDF (`sales/invoices/[id]/page.tsx`), Transportation Charges get their own table row broken into Taxable/CGST+SGST-or-IGST/Amount columns exactly like a product line, rather than one merged figure — kept out of the Notes+Totals merged cell below so it reads as "one more line item," not an addendum. That merged cell's `rowSpan` had been a hardcoded `7`/`8` depending on inter-state; it's now computed (`5 + (isInterState ? 1 : 2) + (roundOff !== 0 ? 1 : 0)`) since a stale hardcoded count desyncs the table the moment Round Off is nonzero — rows past the rowSpan's end silently lose their left offset and collapse against the table's edge.

**GST-safe bin retention ships in this commit** — `CLAUDE.md`'s Features Completed #33 and the Recycle Bin section already describe invoices/purchase-bills/credit-notes as exempt from the 30-day auto-purge (retained indefinitely, `daysLeft: -1`, only hard-deletable from the Bin page with an admin-only warning); `e379026`'s `src/app/api/bin/route.ts` diff is the actual landing of that logic — the auto-purge queries for these three types were deleted outright and their `daysLeft` computation replaced with a flat `-1`. (Era 9 didn't cover this because it hadn't been committed yet when Era 9 was written — the feature existed in the working tree, not in git history, until now.)

The commit's title also mentions a "DocumentNumberingConfig model," but no such model appears in the actual `schema.prisma` diff — only the transport-charge columns landed schema-wise. Treat that phrase in the commit message as aspirational/stale, not a fact to design around.

Also in this commit: the Invoice Edit page's "Bill To" customer block (previously just an inline read + a separate edit-modal per Feature #34) gained the **same searchable customer combobox / inline-create / inline-edit flow** New Invoice already had — select a different customer, quick-create one inline, or edit the selected one's details, all from the Edit page instead of just correcting the existing customer's fields. Purchase Bill Edit already had the equivalent via the shared `BillDetailsCard`, so this closes the gap on the sales side specifically.

### 10.3 — `9805580`: PDF header/table polish

One-line note: moved the printed business tagline above the address block instead of below it (closer to how a masthead usually reads name → tagline → address), and tightened the Transportation Charges row's cell alignment/signature (dropped a separate "center" alignment option, since every other percentage column in that row was already right-aligned). Small positioning fix only, not a new feature.

### 10.4 — `01faba0`: `UnitCombo` replaces the Product unit `Select`, Rate List column reorder, Rate List Edit dirty-check

**Product's Unit field switched from a constrained `<Select>` of `PRODUCT_UNITS` to `UnitCombo`** (`src/components/ui/UnitCombo.tsx` — typeable free text plus a filtered suggestion dropdown of the same list). A hard-coded dropdown meant an unusual size+unit string outside the fixed list (`"500 GM"`, `"1 LTR"`, a supplier's own odd unit) was previously impossible to enter on a product at all, not just inconvenient — `UnitCombo` keeps the common short units one click away via suggestions while never blocking a free-text value. Both `products/new` and `products/[id]/edit` now pass an `onUnitChange` callback into the shared `ProductFormFields` instead of relying on a plain `onChange` handler, since `UnitCombo` hands back a bare string rather than a synthetic input-change event.

The Rate List items table's own Unit field **deliberately stayed a plain `Input`, not `UnitCombo`** — this is the origin of the exception now documented in `CLAUDE.md`'s "Do not" rules: `UnitCombo`'s suggestion dropdown is `position: absolute`, and the items table's wrapper is `overflow-x: auto` for horizontal scroll on narrow screens, which clips the dropdown before it can render below the fold. Confirmed broken and reverted the same day it was tried — worth remembering before re-attempting inside any other scrolling table without first teaching `UnitCombo` to portal to `document.body` the way `Select.tsx` already does.

Two smaller fixes rode along: the Rate List detail/list pages' item table (and its Excel export) had its column order changed from **Discount → List Rate → Amount** to **List Rate → Discount → Amount**, reading closer to how a price sheet is normally laid out (base price first, then the adjustment, then the result). And Rate List Edit's Save button gained a real **dirty-check** — it compares current title/note/items against the values loaded on page-open (ignoring items that are still fully blank on both sides) and disables Save when nothing's actually changed, instead of allowing a no-op save on every visit to the page.

### 10.5 — `b487fa1`: unit rename

`PRODUCT_UNITS` (`src/lib/productForm.ts`) renamed one entry, `"Pack"` → `"Pkt"` — a one-line default-unit-list tweak, not a behavior change; existing products already saved with `"Pack"` are untouched since the field is free text (see 10.4) with this list only feeding suggestions.

### 10.6 — `9bb66d7`: Rate List bin support, GST filing XLSX export, login DB-error safety

**Rate Lists gained full Bin integration** — `RateList` now follows the same 30-day-auto-purge soft-delete pattern as customers/products/brands/vendors (not the indefinite-retention path invoices/bills/credit-notes get, since a rate list number carries no GST/legal significance), with restore and permanent-delete wired into `/api/bin/[type]/[id]` and the Bin page's type list. **This closes a gap `CLAUDE.md`'s Pending Tasks section still lists as open as of this writing** ("no Bin integration... currently `DELETE /api/rate-lists/[id]` soft-deletes via `deletedAt` with no way to undo it from the UI") — that line is now stale and should be removed the next time `CLAUDE.md` gets a pass, since the restore/permanent-delete UI it describes as missing shipped in this commit.

**GST filing package gained an `.xlsx` download** (`buildGstFilingWorkbook()`, `src/lib/gstFilingWorkbook.ts`) alongside the existing JSON and `.zip` formats — `GET /api/gst-filing?format=xlsx` builds the workbook and streams it with the same ASCII-safe `Content-Disposition` filename convention the `.zip` path already established (built from the raw `YYYY-MM-DD` query dates, never `report.period.label`, which contains a non-Latin-1 en-dash that throws when set as a raw header value).

**Login now survives a DB outage without leaking which failure occurred.** Previously `prisma.user.findUnique()` inside `authorize()` (`src/lib/auth.ts`) was unguarded — a Neon cold-start, pooled-connection contention (`connection_limit=1`), or any transient network blip during a login attempt would throw out of `authorize()` uncaught. NextAuth already collapses any thrown error into the same generic "Incorrect email or password" response, so this wasn't a crash bug, but it also logged nothing server-side to distinguish "wrong password" from "database unreachable" — a real outage would look identical to bad credentials in the logs, at exactly the moment someone's trying to diagnose it. The lookup is now wrapped in try/catch: on failure it logs `[auth] DB lookup failed during login attempt` server-side (email + error, no password) and returns `null` same as a bad password, keeping the user-facing behavior and timing identical while making the actual cause diagnosable from logs.

Also bundled: a shared `RequiredStar` component (small `*` span, previously copy-pasted inline — see `InvoiceOptionsRow.tsx` in 10.2 for an example of the inline version this presumably now replaces) and misc UI polish across Permissions, Bin, Invoices, Purchase Bills, and Reports pages.

---

## Era 11 — Numbering default reverted back to `prefix_fy_seq` (2026-08-17)

**Correction to Era 9.1's history above.** Era 9.1 recorded that the default document-numbering layout (used whenever `invoiceNumberFormat`/`purchaseBillNumberFormat`/`creditNoteNumberFormat` is `null`, i.e. nothing has been explicitly configured in Settings yet) was switched from `prefix_fy_seq` (`SH-2026-27-0001`) to `seq_fy` (`18/2026-27`). That switch shipped in code (`resolveNumberFormat()`'s fallback in `src/lib/documentNumbering.ts`) but `CLAUDE.md` was never updated to match — it kept describing `prefix_fy_seq`/`SH-YYYY-0001` as the default the whole time, a drift an audit of this app's own documentation surfaced while writing the 3rd-edition "Bible."

Rather than fix the documentation to match the code, the explicit decision today was the opposite: **revert the code's fallback back to `prefix_fy_seq`**, so a brand-new business's very first invoice/purchase-bill/credit-note — before anyone has touched Settings → Document Numbering — numbers as `SH-2026-27-0001`-style (prefix auto-derived from the business name via `deriveDefaultPrefix()`), not the plain `18/2026-27` style. This only changes the fallback used when a `BusinessSettings` field is `null`; a business that already explicitly selected a format in Settings keeps exactly what it picked — this code path is never consulted for them at all.

Changed: `resolveNumberFormat()`'s fallback (`documentNumbering.ts`) and the Settings page's `numberingForm` pre-open initial state (`settings/page.tsx`, cosmetic only — the modal always re-populates from `resolveNumberFormat(saved.xNumberFormat)` the instant it opens, so this only affected the very first render before that runs). `CLAUDE.md`'s existing `prefix_fy_seq`-as-default text needed no change — it was already describing the layout the code implements again as of this Era.

---

## Era 12 — Validation hardening, full-app audit, PDF rewrite, drag-reorder, mobile/toolbar retrofit, cache/idempotency hardening (2026-08-18 → 2026-08-27)

### 12.1 — `9de3a12`/`f48857a` (2026-08-18): input length bounds, draft-expiry, mobile polish

Server-side min/max length checks added alongside existing format rules (name, address, city, bank fields, password) across `validation.ts` and every per-entity form lib, closing gaps that let empty/oversized/whitespace-only values through — client `FormField`s and API routes were kept in sync in the same commit rather than validating one side only. Alongside it: the topbar condenses into a `MoreMenu` below 480px, a permissions-page mobile-card skeleton was added, admin toolbar buttons resized, stale form drafts now expire, and autosave no longer resurrects a form the user just dismissed empty.

### 12.2 — `3cea3f8`/`f1878aa` (2026-08-19): audit fixes + PDF renderer rewrite

Closes `AUTH-001/002`, `API-001..004`, `DB-001`, `BIZ-001..003`, `SEC-003..005`, `PDF-002`, `UX-001` from `docs/SCIENCE_HUB_AUDIT_REPORT.md` — Vercel Blob URL validation hardened against cross-store spoofing (the exact-hostname-match logic `blobStorage.ts` still documents today), SMTP header injection closed, logo-blob cleanup moved server-side into `PUT /api/settings`, plus a reworked invoice/purchase-bill PDF renderer. A same-day follow-up (`f1878aa`) fixed a Vercel build failure: `@auth/core`/`next-auth` both peer-depend on `nodemailer ^7||^8`, conflicting with the `nodemailer@9.0.5` CVE bump from the audit — resolved via `npm overrides` rather than downgrading either package (a stale local `node_modules` had been masking the conflict; only a clean install, like Vercel's, hit it).

### 12.3 — `0e483eb` (2026-08-20): drag-to-reorder, product bulk import

Invoice/purchase-bill/rate-list line items gained drag-to-reorder. Products gained bulk import from Excel/CSV, plus discard-draft confirmation dialogs. `ConfirmDialog` now portals to `document.body` (fixes it rendering trapped inside a transformed ancestor); the admin activity log switched to the shared `Pagination` component instead of its own hand-rolled version; the Product form's "Price" label was renamed to "List Price" for clarity against `purchasePrice`.

### 12.4 — `66177dc` (2026-08-21): full-app audit, all 14 phases

25+ findings closed across auth/API trust boundaries, blob-URL validation, the same-day payment-date bug (`toIstDateStr()`), N+1/unbounded queries, missing error boundaries, and accessibility contrast/labels; `next`/`nodemailer` bumped and the unused `@auth/prisma-adapter` dropped, clearing every critical/high `npm audit` finding. Added the retrying `prisma migrate deploy` wrapper for Neon cold-start flakiness (`scripts/migrate-deploy-retry.js`). Full finding-by-finding detail lives in `docs/SCIENCE_HUB_AUDIT_REPORT.md`/`SCIENCE_HUB_AUDIT_STATE.md`; the summary is also folded into `CLAUDE.md`'s Features Completed #36.

### 12.5 — `7fbad8e`/`ed66e57`/`d7fc2bb` (2026-08-25): mobile breakpoint + toolbar-component retrofit, dashboard chart fixes

Mobile breakpoints standardized further and four shared toolbar components extracted (`SearchField`, `DateRangeFilter`, `HeaderActionsRow`, `ToolbarField`) and rolled out across every list/report page, replacing hand-duplicated per-page toolbar markup. Full-page loading overlays added for pagination navigation and Excel exports; `Spinner` overlays now portal to `document.body` (same transform-trapped-positioning fix `ConfirmDialog` got in 12.3, applied to the other overlay component); form-control mobile heights synced across `Button`/`Input`/`Select`/`DatePicker`/`PasswordInput`/`PhoneInput`. Separately: dashboard bar-chart value labels now float above each bar's own top (scaled to 84% max height, background badge on hover) instead of a shared fixed row that clipped against `chartScroll`'s overflow interaction; Purchase Bills list narrowed its Vendor column and widened Bill No.; the draft/numbering `InfoBanner`s moved inside the form's left column on New/Edit Invoice, Purchase Bill, and Rate List pages; the Sales/Purchases Overview chart's top padding was fixed.

### 12.6 — `76412b3` (2026-08-26): cache-invalidation, idempotency, and integrity hardening

Triggered by a real report — restoring a credit note from the Bin didn't appear on the Credit Notes list without a hard refresh. Root cause: **`bustCachePrefix()` never matched sibling sub-paths** (busting `/api/invoices` missed `/api/invoices/stats`) — a systemic gap, not just the Bin's. Fixed at the root (`bustCachePrefix()` now also matches `` `${prefix}/...` ``) plus missing cache-bust calls added across invoice/purchase-bill payment/return/delete/edit/cancel flows and brand/category rename (products embed brand/category names, so a rename must bust the products cache too). Multiple rounds of specialist review (security/database/api/react/performance/regression) surfaced further real bugs folded into the same commit:
- **Purchase Bill edit now re-checks its optimistic-concurrency lock inside the transaction**, mirroring the Invoice edit guard that already existed — closed a race where two concurrent edits could silently corrupt item/stock state.
- **Client-generated idempotency keys** added to Invoice, PurchaseBill, Payment, PurchasePayment, and Return creation (`useIdempotencyKey.ts`) — a retried/duplicated submission can no longer create a second document/payment/credit-note. Lookups are scoped to the parent resource, so a key collision across two different invoices/bills is rejected (409) rather than silently dropping the real payment.
- Payment-recording transactions gained an explicit timeout (Prisma's default was too tight for this database's real-world latency, causing intermittent mid-transaction failures).
- Several more double-submit bugs fixed (the Era 9.4 "saving flag reset before `router.push`" pattern, found recurring in a few flows that pattern hadn't reached yet).
- **Performance**: GST Summary now aggregates by month in the database instead of loading every invoice into memory; Purchase-by-category now uses one `groupBy` instead of an in-memory reduce; Bin's brand/category purge is batched instead of one query per row; Bin's GST-retained types (invoices/purchase bills/credit notes) are now capped per request with a "Load more" control instead of always fetching full history (Empty Bin's confirmation now shows the true total across all retained items, not just what's loaded); admin activity log's lazy 30-day purge now only runs on the first page; new indexes on `Payment.date`/`PurchasePayment.date`/`Return.date`; admin users/permissions routes capped at 500 rows.

### 12.7 — `baef4f2` (2026-08-27): unguarded fetch responses on 404

Purchase bill detail/edit and vendor edit were treating a non-2xx response body as valid entity data (no `r.ok` check) — a 404 (deleted/invalid id) crashed to the error boundary instead of showing a proper not-found state. Found via live browser testing, not a code-review pass. **New pages should check `r.ok` before treating a fetch response as the entity, not just check for a network-level throw.**

---

## Era 13 — Formula-injection hardening, stock-adjustment preview (`5f92aaa`/`c4fa94a`/`af4c2df`, 2026-08-31)

CSV/XLSX export formula-injection hardening (`src/lib/formulaSafety.ts` — a `neutralizeFormulaCell()` helper) wired into `gstFilingWorkbook.ts`, `gstFilingZip.ts`'s CSV writer, and `xlsxExport.ts`, so a cell value starting with `=`/`+`/`-`/`@` can no longer be evaluated as a formula by Excel when a report is opened — CSV in particular has no per-cell type metadata, so a plain string write there is exploitable in a way `.xlsx` isn't. Alongside: a stock-adjustment preview (current/delta/new-stock, with a color tone per direction) added to the Product detail page's Adjust Stock dialog, mobile numeric keypad (`inputMode="numeric"`) on pincode/bank-account fields, and small CSS/copy tweaks to the GST filing date filters and a few form fields.

---

## Era 14 — GSTR-1 Offline Tool CSV export, Tier 1 no-GSP (`feature/gst-filing-tier1-no-gsp` merged into `dev`, 2026-09-02)

`reports/gst-reports` gained a "Download for GST Portal (Offline Tool CSVs)" button producing a ZIP of section-wise CSVs matching the exact header/column format of the GST Returns Offline Tool's own bundled sample files (verified against the real `Section_wise_CSV_files/GSTR1/*.csv` from Offline Tool V3.2.4): `b2b,sez,de.csv`, `b2cs.csv`, `cdnr.csv`, `hsn(b2b).csv`, `hsn(b2c).csv`, plus a README and a `Validation-Report.csv`. This is deliberately "Tier 1, no GSP" — the app never talks to GSTN directly; the user imports each CSV into the free Offline Tool, reviews there, and generates the upload JSON the portal actually accepts.

New `src/lib/gstStateCodes.ts` (GST state/UT code table, keyed by `INDIA_STATES_FULL` spelling — Lakshadweep deliberately spelled "Lakshdweep" to match the Offline Tool's own master list) and `src/lib/gstUqc.ts` (free-text-unit → GST UQC code mapping, falling back to `OTH-OTHERS` with a validation warning for an unmapped unit rather than blocking the export). `src/lib/gstFiling.ts`'s `buildGstFilingReport()` gained `salesRegisterByRate` (splits a single multi-rate invoice into one B2B row per rate) and `hsnSummaryB2B`/`hsnSummaryB2C`. An unresolvable place-of-supply drops that row with a validation error instead of emitting one the Offline Tool would reject; B2C aggregates by place-of-supply+rate, not invoice-wise. See `src/lib/gstr1CsvExport.ts`/`gstr1CsvZip.ts` and `tests/unit/gstr1CsvExport.test.ts`.

Merge note: `CLAUDE.md` conflicted against `dev`'s own concurrent doc updates (Era 12.6/12.7, formula-safety) — resolved by keeping `dev`'s content and folding this feature's doc updates in on top (Features Completed #42) rather than taking either side wholesale.

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
- **`bustCachePrefix(prefix)` matches `prefix` itself and any `` `${prefix}/...` `` sibling sub-path** (e.g. busting `/api/invoices` also busts `/api/invoices/stats`) — a mutation route that touches a base resource must still call `bustCachePrefix()` on it even if the change is only reflected in a sibling sub-route's cached response, not the base route's own. Fixed Era 12.6 after this gap turned out to be systemic, not a one-off.
- **A create endpoint a client can plausibly retry/double-submit should accept a client-generated idempotency key**, scoped to its parent resource (`useIdempotencyKey.ts`) — follow the Invoice/PurchaseBill/Payment/PurchasePayment/Return pattern from Era 12.6 for any new money- or document-creating route.
- **Any page that fetches a single entity by id must check `r.ok` before treating the response body as that entity** — a non-2xx body (e.g. a 404's error JSON) is not valid entity data; render a not-found state instead of letting it flow into the page as if it were. Fixed Era 12.7.

## Operational Notes

- **`prisma generate` fails while the dev server is running** (`EPERM` on the query-engine `.dll.node`) — stop the dev server before any schema change. A generate that races the dev server can leave the client *half-generated* (TS types updated, the embedded runtime `schema.prisma` snapshot stale) — after any retried generate, verify `node_modules/.prisma/client/schema.prisma` actually contains the new columns, don't just trust a "success" message.
- **`prisma migrate dev` doesn't work in a non-interactive shell** — migrations get hand-written as a timestamped `migration.sql` and applied with `prisma migrate deploy`.
- **The local `.env` database is not the live/production one** — it holds what looks like the seed script's deterministic dummy data (dozens of rows), not the small number of real rows a live business would have. Confirmed more than once. Any lookup/edit of specific real records has to go through the user directly (Neon console, psql) — never assume a local Prisma query is hitting production.
- **Windows + `npm run build`'s `prebuild` step can `ENOTEMPTY` on `.next/dev`** if the dev server is running concurrently — same root cause as the Prisma one. `npx tsc --noEmit` + targeted `eslint <file>` is an acceptable stand-in when a full build can't run for this reason, *provided* no schema/migration change is part of what's being verified.
- A pre-commit hook blocks `schema.prisma` changes without a matching migration file — don't try to bypass it; write the migration.
