// Shared "bulk download as ZIP" helpers — sequentially produces one or more named blob entries per
// item (only one render/fetch ever in flight at a time) and packs the results into a single ZIP
// download. Shared by the Invoices and Purchase Bills list pages' month-wise bulk download action;
// Purchase Bills additionally uses this to bundle each bill's uploaded attachment alongside/instead
// of its generated PDF (see BulkDownloadOptionsDialog).

export interface ZipEntry {
  /** Path inside the zip, e.g. "SH-2026-27-0001.pdf" or "Attachments/PB-2026-27-0001 - scan.pdf". */
  name: string;
  blob: Blob;
}

/** Replaces characters JSZip/most filesystems can't use in a single path segment (a document number like "02/2026-27" contains "/", which JSZip would otherwise read as a folder separator). */
export function sanitizeZipEntryName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

/** Generic form: each item may contribute zero, one, or several named entries (e.g. a bill's PDF AND its attachment). A failed item should just return an empty array — it's silently skipped, not fatal to the batch. */
export async function bulkZipDownload<T>(
  items: T[],
  produceEntries: (item: T) => Promise<ZipEntry[]>,
  zipFileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ entriesZipped: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let entriesZipped = 0;

  for (const [idx, item] of items.entries()) {
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
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { entriesZipped };
}

export interface BulkZipItem {
  /** Entry name inside the zip, e.g. "SH-2026-27-0001.pdf" — must already be filesystem-safe (no "/"). */
  fileName: string;
}

export interface BulkDownloadResult {
  succeeded: number;
  failed: string[]; // fileNames that failed to render
}

/** Simple one-PDF-per-item case (Invoices, and Purchase Bills' PDFs-only path) — built on bulkZipDownload. */
export async function bulkDownloadPdfsAsZip<T extends BulkZipItem>(
  items: T[],
  generatePdf: (item: T) => Promise<Blob | null>,
  zipFileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkDownloadResult> {
  const failed: string[] = [];
  const { entriesZipped } = await bulkZipDownload(
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
  );
  return { succeeded: entriesZipped, failed };
}
