# Invoice PDF Cache & Logo Toggle Bugfix Design

## Overview

This design addresses three interrelated bugs in the invoicing workflow:

1. The invoice detail page (`/sales/invoices/[id]`) bypasses the IndexedDB PDF cache, causing expensive html2canvas/jsPDF regeneration on every Download, Print, or Share action — even though the list page and purchase bill detail page use the cache correctly.
2. The "Show logo on invoices" toggle on the settings page disables during save but provides no visual loading feedback, leaving users uncertain if their click registered.
3. After saving any setting, the settings page calls `bustCache("/api/settings")` which only deletes the cache entry without notifying mounted `useFetch` subscribers — so other pages continue showing stale settings until a manual refresh.

The fix is minimal and targeted: wire the existing `pdfCache.ts` utilities into the detail page's `generatePdfBlob()`, add a CSS spinner to the toggle during save, and replace `bustCache` with `patchCache` in `putSettings()`.

## Glossary

- **Bug_Condition (C)**: The set of inputs/actions that trigger one of the three defective behaviors
- **Property (P)**: The desired correct behavior for inputs matching the bug condition
- **Preservation**: Existing behaviors that must remain unchanged after the fix
- **`generatePdfBlob()`**: The function in `src/app/(dashboard)/sales/invoices/[id]/page.tsx` that generates a PDF blob from the `#invoice-print-area` DOM element
- **`pdfCache.ts`**: IndexedDB-backed cache module (`src/lib/pdfCache.ts`) with `getCachedPdf`, `setCachedPdf`, `buildPdfVariantKey`, `invalidateCachedPdf`
- **`useCache.ts`**: In-memory cache + pub/sub module (`src/lib/useCache.ts`) with `bustCache` (delete only) and `patchCache` (delete + publish to all subscribers)
- **`putSettings()`**: The function in `src/app/(dashboard)/settings/page.tsx` that PUTs updated settings to the API and manages cache invalidation
- **Variant Key**: A stable string identifying a unique PDF render configuration (copy labels + toggle states + settings timestamp)

## Bug Details

### Bug Condition

The bugs manifest in three distinct scenarios:

**Bug 1 — PDF cache bypass on detail page:**
The `generatePdfBlob()` function calls `generateInvoicePdfBlob()` directly without checking or writing to IndexedDB. Every Download, Print, or Share triggers a full CPU-heavy re-render.

**Bug 2 — No loading indicator on logo toggle:**
When `handleToggleInvoiceLogo()` sets `savingBranding = true`, the toggle button is disabled but has no visual loading state (no spinner, no opacity change).

**Bug 3 — Stale settings after save:**
`putSettings()` calls `bustCache("/api/settings")` which removes the entry but does not push the new value to already-mounted `useFetch("/api/settings")` subscribers. Pages consuming settings continue to show old values.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserAction
  OUTPUT: boolean

  // Bug 1: PDF generation on detail page without cache
  IF input.page = "/sales/invoices/[id]"
     AND input.action IN ["download", "print", "share"]
  THEN RETURN TRUE

  // Bug 2: Logo toggle with no spinner
  IF input.page = "/settings"
     AND input.action = "toggleShowLogoOnInvoices"
     AND savingBranding = TRUE
  THEN RETURN TRUE

  // Bug 3: Settings save with bustCache instead of patchCache
  IF input.page = "/settings"
     AND input.action = "saveSettings"
     AND cacheInvalidationMethod = "bustCache"
  THEN RETURN TRUE

  RETURN FALSE
END FUNCTION
```

### Examples

- **Bug 1 example**: User opens invoice #INV-001 detail page, clicks "Download PDF" → system spends 2-3s running html2canvas/jsPDF. User clicks "Print" → system spends another 2-3s regenerating the identical PDF. Expected: second action should serve cached blob instantly.
- **Bug 1 example (cross-page)**: User views invoice on list page (PDF cached via iframe), navigates to detail page, clicks Download → system regenerates from scratch instead of serving the cached blob.
- **Bug 2 example**: User clicks "Show logo on invoices" toggle → button becomes disabled but looks identical to its enabled state. User cannot tell if action registered, may try clicking again.
- **Bug 3 example**: User disables "Show logo on invoices" on settings page → navigates to invoices page → invoices page still shows logo because `useFetch("/api/settings")` still has the old value in memory. Only a hard refresh loads the new setting.
- **Edge case**: User toggles `showPaymentInPdf` on detail page then downloads → variant key must differ from the default so a separate cache entry is stored.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The invoice list page's PDF generation via iframe must continue to check cache first and store results after generation, exactly as it does today
- Editing an invoice must continue to invalidate the cached PDF via `invalidateCachedPdf`
- Sign-out must continue to clear all cached PDFs via `clearAllCachedPdfs`
- Mouse clicks on the logo toggle must continue to trigger `handleToggleInvoiceLogo` and produce success/error toasts
- Other settings sections (Business Identity, Bank Details, Terms, Email, Logo upload/removal) must continue to save identically
- The `patchCache` call must not affect optimistic-update behavior of other pages using `patchData`/`mutate` on different URLs
- The toggle's accessible `role="switch"` and `aria-checked` behavior must remain unchanged

**Scope:**
All inputs that do NOT involve the three bug scenarios should be completely unaffected by this fix. This includes:
- PDF generation on the list page (already cached)
- PDF generation on the purchase bills pages (already cached)
- Non-PDF actions on the invoice detail page (payments, returns, edit, delete)
- Settings saves for sections other than the logo toggle (no spinner change needed)
- Navigation between pages when settings haven't been changed

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing cache integration in detail page**: When the detail page was originally written, it called `generateInvoicePdfBlob()` directly. Later, `pdfCache.ts` was added and integrated into the list page and purchase-bill detail page, but the invoice detail page was never updated. The import for `getCachedPdf`/`setCachedPdf`/`buildPdfVariantKey` is simply missing, and `generatePdfBlob()` has no cache-check logic.

2. **CSS-only disabled state with no spinner**: The toggle uses `disabled={savingBranding}` which prevents clicks but adds no visual change. The CSS module has no `.saving`/`.loading` modifier class, and no inline spinner component is rendered conditionally on `savingBranding`.

3. **`bustCache` vs `patchCache` misuse**: The developer likely intended to invalidate stale data, but used `bustCache` (which only deletes the entry) instead of `patchCache` (which deletes AND publishes the new value to all active subscribers). Since `useFetch` only fetches on first mount when no cache exists, busting without publishing leaves mounted components showing stale data until they remount.

## Correctness Properties

Property 1: Bug Condition - PDF Cache Hit on Detail Page

_For any_ PDF action (download, print, share) on the invoice detail page where a matching variant already exists in IndexedDB, the fixed `generatePdfBlob` function SHALL return the cached blob without calling `generateInvoicePdfBlob`, and the returned blob SHALL be byte-identical to the cached entry.

**Validates: Requirements 2.1**

Property 2: Bug Condition - PDF Cache Write on Detail Page

_For any_ PDF action on the invoice detail page where no matching variant exists in IndexedDB, the fixed `generatePdfBlob` function SHALL call `generateInvoicePdfBlob` to produce a blob AND store it in IndexedDB via `setCachedPdf` with the correct entity ID and variant key, so subsequent calls with the same parameters return the cached version.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Logo Toggle Loading Indicator

_For any_ click on the "Show logo on invoices" toggle that triggers `handleToggleInvoiceLogo`, the UI SHALL display a visible loading indicator (spinner or opacity change) for the duration that `savingBranding` is true, providing clear feedback that the save is in progress.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Settings Publish to Subscribers

_For any_ successful settings save via `putSettings`, the function SHALL call `patchCache("/api/settings", () => data)` instead of `bustCache("/api/settings")`, causing all mounted `useFetch("/api/settings")` subscribers to immediately receive the updated settings object without requiring a page refresh.

**Validates: Requirements 2.4**

Property 5: Preservation - List Page Cache Behavior

_For any_ PDF action on the invoice list page, the fixed code SHALL produce exactly the same caching behavior as the original code — checking cache first via `getCachedPdf` and storing via `setCachedPdf` — preserving the existing integration unchanged.

**Validates: Requirements 3.1, 3.2**

Property 6: Preservation - Variant Key Correctness

_For any_ combination of `showPaymentInPdf`, `showReturnInPdf`, `showLogoOnInvoices`, and `settings.updatedAt` values, the variant key produced by `buildPdfVariantKey` SHALL be distinct, ensuring toggling any render flag produces a different cache entry and never serves an incorrect cached version.

**Validates: Requirements 3.3**

Property 7: Preservation - Non-Settings URL Independence

_For any_ call to `patchCache("/api/settings", ...)`, the in-memory cache and subscribers for other URLs (e.g., `/api/invoices`, `/api/products`) SHALL remain completely unaffected, preserving existing optimistic-update patterns on unrelated endpoints.

**Validates: Requirements 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/(dashboard)/sales/invoices/[id]/page.tsx`

**Function**: `generatePdfBlob(copyLabels?: string[]): Promise<Blob | null>`

**Specific Changes**:
1. **Add imports**: Import `getCachedPdf`, `setCachedPdf`, `buildPdfVariantKey` from `@/lib/pdfCache`
2. **Build variant key**: Before generating, compute a variant key using `buildPdfVariantKey(copyLabels, { p: showPaymentInPdf, r: showReturnInPdf, logo: settings?.showLogoOnInvoices !== false, settings: settings?.updatedAt ?? "" })`
3. **Check cache first**: Call `getCachedPdf("invoice", id, variantKey)` and return the cached blob if found
4. **Store after generation**: After `generateInvoicePdfBlob()` produces a blob, call `setCachedPdf("invoice", id, variantKey, blob)` before returning
5. **Preserve force-regeneration path**: The `handlePrint` and `handleShare` functions should use the cached version (no force flag needed since cache invalidation already handles data changes)

---

**File**: `src/app/(dashboard)/settings/page.tsx`

**Function**: `handleToggleInvoiceLogo()` / toggle JSX

**Specific Changes**:
1. **Add spinner to toggle**: Render an inline spinner (small `<span>` with CSS animation) inside or adjacent to the toggle button when `savingBranding` is true
2. **Add opacity/disabled style**: Apply a reduced-opacity class to the toggle container when `savingBranding` is true, providing additional visual cue
3. **CSS module update**: Add a `.invoiceLogoSwitchSaving` class to `settings.module.css` with opacity and spinner animation

---

**File**: `src/app/(dashboard)/settings/page.tsx`

**Function**: `putSettings(overrides)`

**Specific Changes**:
1. **Replace bustCache with patchCache**: Change `bustCache("/api/settings")` to `patchCache("/api/settings", () => data)` where `data` is the fresh response from `res.json()`
2. **Update import**: Change the import from `bustCache` to `patchCache` from `@/lib/useCache` (or import both if `bustCache` is used elsewhere in the file)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise the three bug scenarios and assert expected behavior. Run these tests on the UNFIXED code to observe failures and confirm the root causes.

**Test Cases**:
1. **PDF Cache Miss Test**: Call `generatePdfBlob()` on the detail page, then call it again with the same parameters — assert that `generateInvoicePdfBlob` is NOT called the second time (will fail on unfixed code because no caching exists)
2. **PDF Cache Write Test**: Call `generatePdfBlob()` on the detail page, then check IndexedDB for the expected cache entry — assert it exists (will fail on unfixed code because `setCachedPdf` is never called)
3. **Toggle Spinner Test**: Set `savingBranding = true` and render the toggle — assert a loading indicator element is visible (will fail on unfixed code because no spinner exists)
4. **Settings Publish Test**: Call `putSettings({...})` successfully, then check if `patchCache` was invoked instead of `bustCache` — assert `patchCache` was called (will fail on unfixed code because `bustCache` is used)

**Expected Counterexamples**:
- `generateInvoicePdfBlob` is always called regardless of cache state
- IndexedDB has no entries after detail-page PDF generation
- No spinner/loading element exists in the DOM during save
- `bustCache` is called instead of `patchCache`, leaving subscribers stale

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.bug = "pdf-cache" THEN
    result := generatePdfBlob_fixed(input.copyLabels)
    ASSERT cachedBlobReturnedWhenAvailable(result)
    ASSERT blobStoredInCacheAfterGeneration(result)
  ELSE IF input.bug = "toggle-spinner" THEN
    render := renderToggle_fixed(savingBranding=true)
    ASSERT spinnerVisible(render)
  ELSE IF input.bug = "settings-publish" THEN
    result := putSettings_fixed(input.overrides)
    ASSERT patchCacheCalled("/api/settings", result.data)
    ASSERT subscribersReceiveNewData()
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many variant key combinations to verify uniqueness and correctness
- It catches edge cases in cache key construction that manual tests might miss
- It provides strong guarantees that non-buggy paths are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for list-page caching, non-logo-toggle settings saves, and non-PDF invoice actions, then write property-based tests capturing that behavior.

**Test Cases**:
1. **List Page Cache Preservation**: Verify the list page's `generatePdfViaIframe` continues to check/write cache identically after the fix
2. **Variant Key Uniqueness**: Generate random combinations of `copyLabels`, `showPaymentInPdf`, `showReturnInPdf`, `showLogoOnInvoices`, and `settings.updatedAt` — verify each unique combination produces a unique variant key
3. **Non-Logo Settings Save**: Verify saving Business Identity or Bank Details still works identically (toast shown, data updated, PDF cache cleared)
4. **Invoice Edit Invalidation**: Verify editing an invoice still calls `invalidateCachedPdf` and subsequent PDF generation produces a fresh blob

### Unit Tests

- Test `buildPdfVariantKey` produces distinct keys for different toggle combinations
- Test `generatePdfBlob` returns cached blob when `getCachedPdf` resolves with a blob
- Test `generatePdfBlob` calls `setCachedPdf` after successful generation
- Test `generatePdfBlob` still calls `generateInvoicePdfBlob` when cache is empty
- Test toggle renders spinner element when `savingBranding` is true
- Test toggle does NOT render spinner when `savingBranding` is false
- Test `putSettings` calls `patchCache` (not `bustCache`) on success

### Property-Based Tests

- Generate random `copyLabels` arrays and toggle boolean states, verify `buildPdfVariantKey` is deterministic (same inputs → same key) and injective (different inputs → different key)
- Generate random settings objects, verify `patchCache` publishes the exact object to subscribers without mutation
- Generate sequences of cache-check/write operations, verify the detail page cache behavior matches the list page's established pattern

### Integration Tests

- Full flow: user opens detail page → downloads PDF (cache miss, blob generated and stored) → downloads again (cache hit, no regeneration) → edits invoice → downloads again (cache invalidated, fresh generation)
- Full flow: user toggles logo on settings → spinner visible during save → toggle updates → navigates to invoices page → new setting is reflected without refresh
- Full flow: user changes settings → other mounted page shows updated settings immediately via subscriber notification
