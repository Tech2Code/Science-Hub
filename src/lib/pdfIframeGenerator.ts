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

// Loads a detail page into a hidden iframe to render its full print area (which the list page lacks data for) and generates a PDF blob from it.
// Shared by Invoices/Purchase Bills list pages so iframe-polling/cleanup/timeout logic can't drift apart.
export function generatePdfViaIframe({ route, printAreaId, copyLabels, includeLogo }: GeneratePdfViaIframeOptions): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      cleanup();
      resolve(blob);
    };
    const safetyTimer = setTimeout(() => finish(null), 45000);
    iframe.onload = async () => {
      if (settled) return;
      const el = await new Promise<HTMLElement | null>(resolveEl => {
        let tries = 0;
        const check = () => {
          if (settled) { resolveEl(null); return; }
          const area = iframe.contentDocument?.getElementById(printAreaId);
          if (area?.querySelector("tbody tr")) { resolveEl(area); return; }
          if (++tries > 40) { resolveEl(null); return; }
          setTimeout(check, 250);
        };
        setTimeout(check, 250);
      });
      if (!el || settled) { finish(null); return; }
      await new Promise(r => setTimeout(r, 400));
      if (settled) return;
      // Read the logo's already-resolved src from the iframe's DOM so continuation-page stamps match page 1.
      const logoUrl = includeLogo ? el.querySelector<HTMLImageElement>('img[alt="Logo"]')?.src || undefined : undefined;
      let blob: Blob | null = null;
      try {
        blob = await generateInvoicePdfBlob(el, { ...(copyLabels ? { copyLabels } : {}), ...(logoUrl ? { logoUrl } : {}) });
      } catch { /* resolved as null below */ }
      finish(blob);
    };
    document.body.appendChild(iframe);
    iframe.src = route;
  });
}
