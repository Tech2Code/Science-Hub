/**
 * Client-side cache for generated invoice/purchase-bill PDFs, backed by
 * IndexedDB so it survives page reloads within the same login session.
 * Cleared on sign-out (see DashboardShell) — never persists across logins.
 *
 * PDF generation (html2canvas + jsPDF) is the expensive step, not the data
 * fetch (already cached by useCache.ts), so this caches the rendered Blob
 * itself, keyed by entity + the render options/settings that actually change
 * its content (copy labels, payment/return-history toggles, business settings).
 */

const DB_NAME = "science-hub-pdf-cache";
const STORE = "pdfs";
const DB_VERSION = 1;

export type PdfEntity = "invoice" | "purchase-bill";

interface CacheRecord {
  id: string;
  variants: Record<string, Blob>;
}

function recordId(entity: PdfEntity, entityId: string): string {
  return `${entity}:${entityId}`;
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
  } catch {}
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
  } catch {}
}
