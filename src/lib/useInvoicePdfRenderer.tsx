"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InvoicePrintArea } from "@/components/invoices/InvoicePrintArea";
import { PrintAreaStyles } from "@/components/invoices/PrintAreaStyles";
import type { BusinessSettings, Invoice } from "@/components/invoices/invoiceDetailTypes";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";

// Two animation frames: enough for React to commit a just-set state and the browser to lay it out.
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

// html2canvas captures whatever the <img> has painted so far, so wait for the logo to finish loading (or fail) first.
async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending.map((img) => new Promise<void>((resolve) => { img.addEventListener("load", () => resolve(), { once: true }); img.addEventListener("error", () => resolve(), { once: true }); }))),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

interface RenderTarget { invoice: Invoice; settings: BusinessSettings }

/**
 * Builds an invoice's PDF from a list page WITHOUT loading the whole invoice detail page into a hidden iframe:
 * fetch the invoice, mount its print area off-screen in the current page, capture it with the same
 * generateInvoicePdfBlob() pipeline the detail page uses, then unmount. Render `host` once in the page that calls this.
 *
 * Jobs run one at a time (the print area has a fixed DOM id, so two can't be mounted together), which is also what
 * the sequential bulk-ZIP download wants. Always renders the default PDF variant (payment/return history off) — the
 * same variant the iframe version produced, so the PDF cache keys that callers already build stay valid.
 */
export function useInvoicePdfRenderer(settings: BusinessSettings | null): {
  renderInvoicePdf: (invoiceId: string, copyLabels?: string[]) => Promise<Blob | null>;
  host: ReactNode;
} {
  const [target, setTarget] = useState<RenderTarget | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const renderInvoicePdf = useCallback((invoiceId: string, copyLabels?: string[]): Promise<Blob | null> => {
    const job = async (): Promise<Blob | null> => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`, { headers: { "x-no-loader": "1" }, cache: "no-store" });
        if (!res.ok) return null;
        const invoice = (await res.json()) as Invoice;

        // The print area is meaningless without the business header, so never render before settings exist.
        let resolved = settingsRef.current;
        if (!resolved) {
          const sres = await fetch("/api/settings", { headers: { "x-no-loader": "1" }, cache: "no-store" });
          if (!sres.ok) return null;
          resolved = (await sres.json()) as BusinessSettings;
        }

        setTarget({ invoice, settings: resolved });
        await nextFrame();
        await document.fonts.ready;
        const el = document.getElementById("invoice-print-area");
        if (!el) return null;
        await waitForImages(el);
        // Same logo source the iframe version used: whatever the rendered <img alt="Logo"> resolved to (none when the logo is turned off).
        const logoUrl = el.querySelector<HTMLImageElement>('img[alt="Logo"]')?.src || undefined;
        return await generateInvoicePdfBlob(el, { ...(copyLabels ? { copyLabels } : {}), ...(logoUrl ? { logoUrl } : {}) });
      } catch {
        return null;
      } finally {
        setTarget(null);
        await nextFrame(); // let the print area unmount before the next job mounts its own
      }
    };
    const run = queue.current.then(job, job);
    queue.current = run;
    return run;
  }, []);

  const host: ReactNode = target ? (
    <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 850, pointerEvents: "none" }}>
      <PrintAreaStyles />
      <InvoicePrintArea
        invoice={target.invoice}
        settings={target.settings}
        returns={[]}
        balance={Math.round((target.invoice.total - target.invoice.paidAmount) * 100) / 100}
        showPaymentInPdf={false}
        showReturnInPdf={false}
      />
    </div>
  ) : null;

  return { renderInvoicePdf, host };
}
