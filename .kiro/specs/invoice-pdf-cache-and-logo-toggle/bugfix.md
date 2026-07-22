# Bugfix Requirements Document

## Introduction

This document covers two related bugs affecting user experience in the invoicing workflow:

1. **Invoice PDF Cache Not Used on Detail Page** — The invoice detail page (`/sales/invoices/[id]`) regenerates PDFs from scratch every time the user downloads, prints, or shares, despite a fully functional IndexedDB-based PDF cache (`pdfCache.ts`) being available. The list page uses this cache correctly, but the detail page bypasses it entirely, causing unnecessary CPU-heavy html2canvas/jsPDF work and noticeable delays.

2. **Logo Toggle Has No Loading Indicator** — On the settings page, the "Show logo on invoices" toggle disables the button during save but provides no visual loading feedback (no spinner, no opacity change). Users cannot tell if their click registered, leading to confusion and potential double-clicks.

3. **Settings Changes Not Reflected on Invoices Without Page Refresh** — After toggling "Show logo on invoices" on the settings page, navigating to the invoices page still shows the old behavior (logo shown/hidden incorrectly) until the user manually refreshes the page. The settings page calls `bustCache("/api/settings")` which only removes the cache entry but does NOT push the new data to already-mounted `useFetch("/api/settings")` subscribers. Since `useFetch` only re-fetches on mount (not on cache bust), other pages continue showing stale settings data.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user navigates to the invoice detail page and triggers Download PDF, Print, or Share THEN the system calls `generateInvoicePdfBlob()` directly on the DOM element without checking the IndexedDB PDF cache (`getCachedPdf`), regenerating the entire PDF from scratch every time regardless of whether a cached version already exists.

1.2 WHEN a user generates a PDF on the invoice detail page THEN the system does not store the generated PDF blob in the cache (`setCachedPdf`), so subsequent PDF actions on the same invoice (on either the list or detail page) cannot benefit from this generation.

1.3 WHEN a user clicks the "Show logo on invoices" toggle on the settings page THEN the system disables the toggle button (`disabled={savingBranding}`) but provides no visible loading feedback — no spinner, no opacity change, no animation — leaving the user uncertain whether their action registered.

1.4 WHEN a user changes any setting (including "Show logo on invoices") on the settings page and then navigates to the invoices page THEN the invoices page still displays stale settings data because `bustCache("/api/settings")` only deletes the cache entry but does not notify already-mounted `useFetch("/api/settings")` subscribers. The `useFetch` hook only fetches fresh data on first mount when no cache exists — since the invoices page may already be mounted (or mounts with an empty cache slot that triggers a fresh fetch only on that mount), the stale toggle value persists until the user manually refreshes.

### Expected Behavior (Correct)

2.1 WHEN a user triggers Download PDF, Print, or Share on the invoice detail page THEN the system SHALL first check the IndexedDB PDF cache for a matching variant (using `getCachedPdf` with the appropriate entity ID and variant key). If a cached blob exists, it SHALL use it directly without regenerating.

2.2 WHEN no cached PDF exists and the system generates a new PDF blob on the invoice detail page THEN the system SHALL store the generated blob in the IndexedDB cache (using `setCachedPdf` with the appropriate entity ID and variant key) so that future PDF actions can serve the cached version.

2.3 WHEN a user clicks the "Show logo on invoices" toggle on the settings page THEN the system SHALL display a visible loading indicator (inline spinner adjacent to the toggle, or reduced opacity on the toggle area) for the duration of the save operation, so the user has clear feedback that their action is being processed.

2.4 WHEN the settings page successfully saves any setting THEN the system SHALL use `patchCache("/api/settings", ...)` (or equivalent publish mechanism) instead of `bustCache("/api/settings")` to push the updated settings object to all currently mounted `useFetch("/api/settings")` subscribers immediately, so that navigating to the invoices page (or any other page consuming settings) reflects the change without requiring a page refresh.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the invoice list page generates a PDF via iframe THEN the system SHALL CONTINUE TO check the cache first and store results after generation, exactly as it does today.

3.2 WHEN the user edits an invoice THEN the system SHALL CONTINUE TO invalidate the cached PDF for that invoice (via `invalidateCachedPdf`), ensuring stale PDFs are never served after data changes.

3.3 WHEN the detail page generates a PDF with `showPaymentInPdf` or `showReturnInPdf` toggles active THEN the variant key SHALL correctly reflect those toggle states, so toggling them on/off produces distinct cache entries and doesn't serve incorrect cached versions.

3.4 WHEN the user signs out THEN the system SHALL CONTINUE TO clear all cached PDFs (via `clearAllCachedPdfs`), ensuring no cross-session leakage.

3.5 WHEN the settings page saves other settings (business identity, bank details, terms & conditions, logo upload/removal) THEN the system SHALL CONTINUE TO function identically — only the "Show logo on invoices" toggle gains a loading indicator.

3.6 WHEN the "Show logo on invoices" toggle completes saving THEN the system SHALL CONTINUE TO show a success/error toast notification and update the displayed state, as it does today.

3.7 WHEN the settings page uses `patchCache` to push updated settings THEN the system SHALL NOT break the optimistic-update behavior of other pages that use `patchData` or `mutate` on different URLs — the change is scoped only to the "/api/settings" cache key.
