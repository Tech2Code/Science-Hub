"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { InvoicePrintArea } from "@/components/invoices/InvoicePrintArea";
import { PrintAreaStyles } from "@/components/invoices/PrintAreaStyles";
import type { BusinessSettings, Invoice } from "@/components/invoices/invoiceDetailTypes";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { nextFrame, waitForElementById, settleWithin } from "@/lib/domWait";
import { createJobQueue, type JobPriority } from "@/lib/pdfJobQueue";
import { bulkDownloadPdfsAsZip, type BulkZipItem } from "@/lib/bulkPdfDownload";
import styles from "./PdfRenderProvider.module.css";

// One PDF should take seconds; this only exists so a job that never settles (a stalled network request inside the PDF
// pipeline, a hung canvas) can't block every later job forever. The old iframe version had a 45 s safety timer too.
const JOB_TIMEOUT_MS = 45_000;
const FETCH_TIMEOUT_MS = 30_000;

// Not "invoice-print-area": a detail page can be open while a background job renders, and two elements with one id
// would make the detail page's getElementById pick the wrong invoice. (PrintAreaStyles knows this id too.)
const HOST_ELEMENT_ID = "invoice-print-area-bg";

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

export interface RenderOptions {
  /** "high" (default) for something the user just clicked; "low" for the items of a bulk download, which yield to clicks. */
  priority?: JobPriority;
  /** The business settings the caller's cache key was built from; fetched fresh when the caller doesn't have them yet. */
  settings?: BusinessSettings | null;
}

export interface BulkZipRequest<T extends BulkZipItem> {
  /** Singular noun for messages, e.g. "invoice". */
  label: string;
  items: T[];
  produce: (item: T) => Promise<Blob | null>;
  zipFileName: string;
  /** When set, the finished run is reported as a partial download with this message (e.g. the list was truncated). */
  partialNote?: string;
}

export interface BulkState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  cancelling: boolean;
}

const IDLE: BulkState = { running: false, done: 0, total: 0, label: "", cancelling: false };

export interface PdfRenderContextValue {
  renderInvoicePdf: (invoiceId: string, copyLabels?: string[], options?: RenderOptions) => Promise<Blob | null>;
  /** Starts a bulk ZIP that keeps running when the user navigates elsewhere. Returns false when one is already running. */
  startBulkZip: <T extends BulkZipItem>(request: BulkZipRequest<T>) => boolean;
  cancelBulk: () => void;
  bulk: BulkState;
}

export const PdfRenderContext = createContext<PdfRenderContextValue | null>(null);

/**
 * App-wide owner of invoice PDF rendering and of bulk ZIP downloads, mounted once in the dashboard layout.
 *
 * Why it lives above the pages: a PDF is built by mounting the invoice's print area off-screen, and a bulk ZIP can take
 * minutes. If the host and the loop belonged to a list page, leaving that page would tear them down mid-download. Here
 * they survive navigation, a small progress card (with Cancel) follows the user around, and the finished ZIP downloads
 * wherever the user happens to be.
 *
 * Jobs run one at a time through a two-priority queue (see pdfJobQueue.ts): a direct click (View / PDF / Share) jumps
 * ahead of the remaining items of a running bulk download.
 */
export function PdfRenderProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [target, setTarget] = useState<RenderTarget | null>(null);
  const [queue] = useState(() => createJobQueue());
  // Only the job that currently owns the host may unmount it — a job that was abandoned by the timeout and finishes
  // late must not tear down the print area of the job that has since taken over.
  const jobSeq = useRef(0);
  const activeJob = useRef(0);

  const renderInvoicePdf = useCallback((invoiceId: string, copyLabels?: string[], options?: RenderOptions): Promise<Blob | null> => {
    const job = async (): Promise<Blob | null> => {
      const jobId = ++jobSeq.current;
      activeJob.current = jobId;

      const work = async (): Promise<Blob | null> => {
        const res = await fetch(`/api/invoices/${invoiceId}`, { headers: { "x-no-loader": "1" }, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) return null;
        const invoice = (await res.json()) as Invoice;

        // The print area is meaningless without the business header, so never render before settings exist.
        let resolved = options?.settings ?? null;
        if (!resolved) {
          const sres = await fetch("/api/settings", { headers: { "x-no-loader": "1" }, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
          if (!sres.ok) return null;
          resolved = (await sres.json()) as BusinessSettings;
        }

        setTarget({ invoice, settings: resolved });
        await nextFrame();
        await document.fonts.ready;
        const el = await waitForElementById(HOST_ELEMENT_ID);
        if (!el) return null;
        await waitForImages(el);
        // Same logo source the iframe version used: whatever the rendered <img alt="Logo"> resolved to (none when the logo is turned off).
        const logoUrl = el.querySelector<HTMLImageElement>('img[alt="Logo"]')?.src || undefined;
        return await generateInvoicePdfBlob(el, { ...(copyLabels ? { copyLabels } : {}), ...(logoUrl ? { logoUrl } : {}) });
      };

      try {
        return await settleWithin(work(), JOB_TIMEOUT_MS, null);
      } finally {
        if (activeJob.current === jobId) {
          setTarget(null);
          await nextFrame(); // let the print area unmount before the next job mounts its own
        }
      }
    };
    return queue.run(job, options?.priority ?? "high");
  }, [queue]);

  // ---- bulk ZIP: one at a time, app-wide ----
  const [bulk, setBulk] = useState<BulkState>(IDLE);
  const bulkRunning = useRef(false);
  const bulkCancelled = useRef(false);

  const startBulkZip = useCallback(<T extends BulkZipItem>(request: BulkZipRequest<T>): boolean => {
    if (bulkRunning.current) {
      toast({ type: "error", title: "A download is already running", message: "Wait for the current bulk download to finish, or cancel it from the progress card." });
      return false;
    }
    bulkRunning.current = true;
    bulkCancelled.current = false;
    const { label, items, produce, zipFileName, partialNote } = request;
    setBulk({ running: true, done: 0, total: items.length, label, cancelling: false });

    void (async () => {
      try {
        const result = await bulkDownloadPdfsAsZip(
          items,
          produce,
          zipFileName,
          (done, total) => setBulk((b) => ({ ...b, done, total })),
          () => bulkCancelled.current,
        );
        const noun = `${label}${result.succeeded === 1 ? "" : "s"}`;
        if (result.cancelled) {
          toast({ type: "info", title: "Cancelled", message: "Bulk download cancelled — nothing was downloaded." });
        } else if (result.succeeded === 0) {
          toast({ type: "error", title: "Download failed", message: `Could not generate any ${label} PDFs.` });
        } else if (partialNote) {
          toast({ type: "error", title: "Partial download", message: partialNote });
        } else if (result.failed.length > 0) {
          toast({ type: "error", title: "Partial download", message: `${result.succeeded} downloaded, ${result.failed.length} failed — try again for those.` });
        } else {
          toast({ type: "success", title: "Downloaded", message: `${result.succeeded} ${noun} zipped and downloaded.` });
        }
      } catch {
        toast({ type: "error", title: "Download failed", message: "Something went wrong while preparing the ZIP." });
      } finally {
        bulkRunning.current = false;
        setBulk(IDLE);
      }
    })();
    return true;
  }, [toast]);

  const cancelBulk = useCallback(() => {
    if (!bulkRunning.current) return;
    bulkCancelled.current = true;
    setBulk((b) => ({ ...b, cancelling: true }));
  }, []);

  // Reloading or closing the tab would silently lose a long-running job — ask first.
  useEffect(() => {
    if (!bulk.running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [bulk.running]);

  const value = useMemo<PdfRenderContextValue>(() => ({ renderInvoicePdf, startBulkZip, cancelBulk, bulk }), [renderInvoicePdf, startBulkZip, cancelBulk, bulk]);
  const pct = bulk.total > 0 ? Math.min(100, Math.round((bulk.done / bulk.total) * 100)) : 0;

  return (
    <PdfRenderContext.Provider value={value}>
      {children}

      {target && (
        <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 850, pointerEvents: "none" }}>
          <PrintAreaStyles />
          <InvoicePrintArea
            id={HOST_ELEMENT_ID}
            invoice={target.invoice}
            settings={target.settings}
            returns={[]}
            balance={Math.round((target.invoice.total - target.invoice.paidAmount) * 100) / 100}
            showPaymentInPdf={false}
            showReturnInPdf={false}
          />
        </div>
      )}

      {bulk.running && (
        <div className={styles.card} role="group" aria-label="Bulk download progress">
          <div className={styles.head}>
            <Spinner size="sm" />
            <span className={styles.title}>
              {bulk.cancelling ? "Cancelling…" : `Preparing ${bulk.label} ZIP… ${bulk.done}/${bulk.total}`}
            </span>
          </div>
          <div className={styles.track} role="progressbar" aria-label="Bulk download progress" aria-valuemin={0} aria-valuemax={bulk.total} aria-valuenow={bulk.done}>
            <div className={styles.fill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.foot}>
            <span className={styles.hint}>You can keep using the app. Keep this tab open until it finishes.</span>
            <Button variant="secondary" size="sm" onClick={cancelBulk} disabled={bulk.cancelling}>Cancel</Button>
          </div>
        </div>
      )}
    </PdfRenderContext.Provider>
  );
}
