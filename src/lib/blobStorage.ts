import { del } from "@vercel/blob";

// Derives our own store's exact hostname from BLOB_READ_WRITE_TOKEN so the allowlist checks "is this
// blob in our store", not just "shaped like a Vercel Blob store" — a suffix-only check would let a
// user point attachmentUrl/logoUrl at a different store they control, skipping upload validation.
function ownBlobStoreHostname(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const match = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/);
  return match ? `${match[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

// Confines accepted/deletable blobs to this feature's own storage path — otherwise a user could pass
// an arbitrary URL (e.g. a javascript: URI later rendered as <a href>) or delete unrelated blobs.
export function isPurchaseBillBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ownHost = ownBlobStoreHostname();
    return (
      parsed.protocol === "https:" &&
      !!ownHost && parsed.hostname === ownHost &&
      parsed.pathname.startsWith("/purchase-bills/")
    );
  } catch {
    return false;
  }
}

// Same allowlisting rationale as isPurchaseBillBlobUrl, scoped to the
// business logo's own storage path.
export function isLogoBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ownHost = ownBlobStoreHostname();
    return (
      parsed.protocol === "https:" &&
      !!ownHost && parsed.hostname === ownHost &&
      parsed.pathname.startsWith("/logos/")
    );
  } catch {
    return false;
  }
}

// Best-effort cleanup — a failed delete (already gone, misconfigured, or a legacy base64 URL) must never block the caller's DB operation.
export async function deleteAttachmentBlob(url: string | null | undefined) {
  if (!url || !url.startsWith("https://")) return;
  try {
    await del(url);
  } catch (error) {
    console.error("Failed to delete blob:", error);
  }
}
