// Shared "bulk download as ZIP" helpers — sequentially produces one or more named blob entries per
// item (only one render/fetch ever in flight at a time) and packs the results into a single ZIP
// download. Shared by the Invoices and Purchase Bills list pages' month-wise bulk download action;
// Purchase Bills additionally uses this to bundle each bill's uploaded attachment alongside/instead
// of its generated PDF (see BulkDownloadOptionsDialog).

import { safeFileBaseName } from "./fileName";
import { deliverBlob, discardSaveTarget, type SaveTarget } from "./saveFile";

export interface ZipEntry {
  /** Path inside the zip, e.g. "SH-2026-27-0001.pdf" or "Attachments/PB-2026-27-0001 - scan.pdf". */
  name: string;
  blob: Blob;
}

/** Replaces characters JSZip/most filesystems can't use in a single path segment (a document number like "02/2026-27" contains "/", which JSZip would otherwise read as a folder separator). */
export function sanitizeZipEntryName(name: string): string {
  return safeFileBaseName(name, "file");
}

/** Generic form: each item may contribute zero, one, or several named entries (e.g. a bill's PDF AND its attachment). A failed item should just return an empty array — it's silently skipped, not fatal to the batch. */
export async function bulkZipDownload<T>(
  items: T[],
  produceEntries: (item: T) => Promise<ZipEntry[]>,
  zipFileName: string,
  onProgress?: (done: number, total: number) => void,
  /** Checked before each item; when it returns true the run stops, nothing is downloaded, and `cancelled` is true (e.g. the page was left mid-download). */
  isCancelled?: () => boolean,
  /** Where to put the ZIP — from askSaveLocation() (a Save dialog the user already answered). Omitted → a normal browser download. */
  saveTarget: SaveTarget = { kind: "unsupported" },
): Promise<{ entriesZipped: number; cancelled?: boolean; delivery?: "saved" | "started" }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let entriesZipped = 0;

  for (const [idx, item] of items.entries()) {
    if (isCancelled?.()) { await discardSaveTarget(saveTarget); return { entriesZipped: 0, cancelled: true }; }
    let entries: ZipEntry[] = [];
    try {
      entries = await produceEntries(item);
    } catch {
      entries = [];
    }
    for (const e of entries) {
      zip.file(e.name, e.blob);
      entriesZipped++;
    }
    onProgress?.(idx + 1, items.length);
  }

  if (entriesZipped > 0) {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    let delivery: "saved" | "started";
    try {
      delivery = await deliverBlob(zipBlob, zipFileName, saveTarget);
    } catch (e) {
      await discardSaveTarget(saveTarget); // the write failed — don't leave the empty file the Save dialog created
      throw e;
    }
    return { entriesZipped, delivery };
  }

  await discardSaveTarget(saveTarget);
  return { entriesZipped };
}

export interface BulkZipItem {
  /** Entry name inside the zip, e.g. "SH-2026-27-0001.pdf" — must already be filesystem-safe (no "/"). */
  fileName: string;
}

export interface BulkDownloadResult {
  succeeded: number;
  failed: string[]; // fileNames that failed to render
  cancelled?: boolean; // the run was stopped by isCancelled(); nothing was downloaded
  /** "saved" = written where the user chose; "started" = handed to the browser's normal download (outcome unknowable). */
  delivery?: "saved" | "started";
}

/** Simple one-PDF-per-item case (Invoices, and Purchase Bills' PDFs-only path) — built on bulkZipDownload. */
export async function bulkDownloadPdfsAsZip<T extends BulkZipItem>(
  items: T[],
  generatePdf: (item: T) => Promise<Blob | null>,
  zipFileName: string,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
  saveTarget?: SaveTarget,
): Promise<BulkDownloadResult> {
  const failed: string[] = [];
  const { entriesZipped, cancelled, delivery } = await bulkZipDownload(
    items,
    async (item) => {
      const blob = await generatePdf(item);
      if (!blob) {
        failed.push(item.fileName);
        return [];
      }
      return [{ name: item.fileName, blob }];
    },
    zipFileName,
    onProgress,
    isCancelled,
    saveTarget,
  );
  return { succeeded: entriesZipped, failed, ...(cancelled ? { cancelled: true } : {}), ...(delivery ? { delivery } : {}) };
}
