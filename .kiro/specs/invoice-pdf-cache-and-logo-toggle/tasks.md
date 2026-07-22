# Implementation Plan

## Overview

Implementation tasks for the invoice PDF cache integration, settings cache publish fix, and logo toggle loading indicator. Tasks 1, 2, and 3 are independent and can run in parallel. Task 4 is a final checkpoint.

## Tasks

- [ ] 1. Add PDF cache integration to invoice detail page
  - File: `src/app/(dashboard)/sales/invoices/[id]/page.tsx`
  - Import `getCachedPdf`, `setCachedPdf`, `buildPdfVariantKey` from `@/lib/pdfCache`
  - Modify `generatePdfBlob()` to:
    1. Build variant key: `buildPdfVariantKey(copyLabels, { p: showPaymentInPdf, r: showReturnInPdf, logo: settings?.showLogoOnInvoices !== false, settings: settings?.updatedAt ?? "" })`
    2. Check cache: `const cached = await getCachedPdf("invoice", id, variantKey); if (cached) return cached;`
    3. After generation: `if (blob) setCachedPdf("invoice", id, variantKey, blob);`
  - _Bug_Condition: isBugCondition(input) where input.page = "/sales/invoices/[id]" AND input.action IN ["download", "print", "share"]_
  - _Expected_Behavior: Return cached blob when available; store blob after fresh generation_
  - _Preservation: List page cache behavior unchanged; variant key correctly reflects toggle states_
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

- [ ] 2. Replace bustCache with patchCache in settings page
  - File: `src/app/(dashboard)/settings/page.tsx`
  - Change import: add `patchCache` from `@/lib/useCache` (keep `bustCache` if used elsewhere, or replace it)
  - In `putSettings()` function, replace `bustCache("/api/settings")` with `patchCache("/api/settings", () => data)` where `data` is the response from `res.json()`
  - _Bug_Condition: isBugCondition(input) where input.page = "/settings" AND input.action = "saveSettings" AND cacheInvalidationMethod = "bustCache"_
  - _Expected_Behavior: patchCache publishes new settings to all mounted useFetch subscribers immediately_
  - _Preservation: Other URLs unaffected; optimistic-update patterns on different endpoints unchanged_
  - _Requirements: 2.4, 3.7_

- [ ] 3. Add loading indicator to logo toggle
  - Files: `src/app/(dashboard)/settings/page.tsx` and `src/app/(dashboard)/settings/settings.module.css`
  - Add a CSS class `.invoiceLogoSwitchSaving` with `opacity: 0.6` and `cursor: wait`
  - Add the class conditionally to the toggle container when `savingBranding` is true
  - Add an inline spinner (small animated dot or ring) adjacent to the toggle when `savingBranding` is true
  - Preserve accessible `role="switch"` and `aria-checked` behavior
  - _Bug_Condition: isBugCondition(input) where input.page = "/settings" AND input.action = "toggleShowLogoOnInvoices" AND savingBranding = TRUE_
  - _Expected_Behavior: Visible loading indicator (spinner + opacity) displayed while savingBranding is true_
  - _Preservation: Toggle click behavior, success/error toasts, and other settings sections unchanged_
  - _Requirements: 2.3, 3.5, 3.6_

- [ ] 4. Checkpoint - Ensure all changes work correctly
  - Verify PDF cache integration: detail page checks cache before generating, stores blob after generation
  - Verify settings publish: changing a setting on settings page reflects on invoices page without refresh
  - Verify logo toggle: spinner and opacity visible during save, disappears when complete
  - Ensure no regressions in list page PDF caching, invoice edit invalidation, or sign-out cache clearing
  - Ensure all tests pass, ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2", "3"],
    ["4"]
  ]
}
```

Tasks 1, 2, and 3 are independent (can run in parallel). Task 4 depends on all three completing first.

## Notes

- This is a straightforward implementation fix — root cause confirmed by code reading, no exploration test needed.
- The `pdfCache.ts` module is already used by the list page and purchase-bill detail page; we're wiring the same utilities into the invoice detail page.
- The `patchCache` function already exists in `useCache.ts` and is a drop-in replacement for `bustCache` with the added benefit of publishing to subscribers.
