"use client";

import { useContext } from "react";
import { PdfRenderContext, type PdfRenderContextValue } from "@/components/pdf/PdfRenderProvider";

/**
 * Access to the app-wide invoice PDF renderer and bulk-ZIP runner owned by <PdfRenderProvider> (mounted in the
 * dashboard layout). The off-screen print area, the job queue and a running bulk download all live in the provider, so
 * they survive the calling page being left.
 *
 * - renderInvoicePdf(id, copyLabels?, { priority?, settings? }) -> Blob | null (null on failure or after 45 s)
 * - startBulkZip({ label, items, produce, zipFileName, partialNote? }) -> false when one is already running
 * - cancelBulk(), bulk (progress state, for disabling a "Bulk download" button)
 */
export function useInvoicePdfRenderer(): PdfRenderContextValue {
  const ctx = useContext(PdfRenderContext);
  if (!ctx) throw new Error("useInvoicePdfRenderer must be used inside <PdfRenderProvider> (the dashboard layout mounts it).");
  return ctx;
}
