/**
 * IndexedDB cache for generated PDFs (survives reloads, cleared on sign-out). Caches the rendered
 * Blob itself — since html2canvas/jsPDF rendering, not the data fetch, is the expensive step.
 */

const DB_NAME = "science-hub-pdf-cache";
const STORE = "pdfs";
const DB_VERSION = 1;

// Bump whenever the PDF rendering pipeline itself changes, so already-cached blobs (whose entity data
// didn't change) aren't served stale — namespaces cache keys by version instead of forcing manual regeneration.
const RENDER_VERSION = 1;

export type PdfEntity = "invoice" | "purchase-bill" | "return" | "rate-list" | "statement";

interface CacheRecord {
  id: string;
  variants: Record<string, Blob>;
}

function recordId(entity: PdfEntity, entityId: string): string {
  return `${entity}:${entityId}:r${RENDER_VERSION}`;
}

/** Stable key for a given combination of copy labels / extra render flags. */
export function buildPdfVariantKey(copyLabels?: string[], extra?: Record<string, boolean | string | number | null | undefined>): string {
  const labelsPart = copyLabels?.length ? [...copyLabels].sort().join("+") : "default";
  const extraPart = extra
    ? Object.keys(extra).sort().map((k) => `${k}=${String(extra[k])}`).join(",")
    : "";
  return extraPart ? `${labelsPart}|${extraPart}` : labelsPart;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedPdf(entity: PdfEntity, entityId: string, variantKey: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(recordId(entity, entityId));
      req.onsuccess = () => resolve((req.result as CacheRecord | undefined)?.variants?.[variantKey] ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedPdf(entity: PdfEntity, entityId: string, variantKey: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const id = recordId(entity, entityId);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = (getReq.result as CacheRecord | undefined)?.variants ?? {};
        store.put({ id, variants: { ...existing, [variantKey]: blob } });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Cache is a pure optimization — a storage failure must never break PDF generation.
  }
}

/** Drops every cached variant for one invoice/purchase bill — call after any edit/delete. */
export async function invalidateCachedPdf(entity: PdfEntity, entityId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(recordId(entity, entityId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    // Worth logging — a silent failure here means a stale PDF keeps being served with no trace of why.
    console.error("invalidateCachedPdf failed:", err);
  }
}

/** Wipes the entire PDF cache — call on sign-out so nothing carries over to the next login. */
export async function clearAllCachedPdfs(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.error("clearAllCachedPdfs failed:", err);
  }
}
