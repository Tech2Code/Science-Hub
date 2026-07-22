import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";

interface GeneratePdfViaIframeOptions {
  /** Route to load in the hidden iframe, e.g. `/sales/invoices/${id}`. */
  route: string;
  /** DOM id of the print area the target page renders, e.g. "invoice-print-area". */
  printAreaId: string;
  copyLabels?: string[];
  /** Stamp the logo already resolved in the iframe's DOM onto continuation pages. */
  includeLogo?: boolean;
}

// Loads a detail page into a hidden iframe (to render its full print area,
// which the calling list page doesn't have the data for) and generates a PDF
// blob from it — shared by the Invoices and Purchase Bills list pages so the
// iframe-polling/cleanup/timeout dance can't drift apart between them.
export function generatePdfViaIframe({ route, printAreaId, copyLabels, includeLogo }: GeneratePdfViaIframeOptions): Promise<Blob | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };
    const safetyTimer = setTimeout(() => { cleanup(); resolve(null); }, 45000);
    iframe.onload = async () => {
      const el = await new Promise<HTMLElement | null>(resolveEl => {
        let tries = 0;
        const check = () => {
          const area = iframe.contentDocument?.getElementById(printAreaId);
          if (area?.querySelector("tbody tr")) { resolveEl(area); return; }
          if (++tries > 40) { resolveEl(null); return; }
          setTimeout(check, 250);
        };
        setTimeout(check, 250);
      });
      if (!el) { clearTimeout(safetyTimer); cleanup(); resolve(null); return; }
      await new Promise(r => setTimeout(r, 400));
      // Read the logo's already-resolved src straight from the iframe's DOM
      // (either the business's uploaded logo or the default fallback) so the
      // synthetic continuation-page header stamps match what page 1 shows.
      const logoUrl = includeLogo ? el.querySelector<HTMLImageElement>('img[alt="Logo"]')?.src || undefined : undefined;
      let blob: Blob | null = null;
      try {
        blob = await generateInvoicePdfBlob(el, { ...(copyLabels ? { copyLabels } : {}), ...(logoUrl ? { logoUrl } : {}) });
      } catch { /* resolved as null below */ }
      clearTimeout(safetyTimer); cleanup();
      resolve(blob);
    };
    document.body.appendChild(iframe);
    iframe.src = route;
  });
}
