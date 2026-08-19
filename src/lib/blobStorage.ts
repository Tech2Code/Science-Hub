import { del } from "@vercel/blob";

// A Vercel Blob store's public hostname is `<store-id>.public.blob.vercel-
// storage.com`, where store-id is embedded (lowercased) in the store's own
// BLOB_READ_WRITE_TOKEN — verified directly against a real `put()` call's
// returned URL, not just inferred from the token's shape. Deriving the exact
// expected hostname from *our own* token means the allowlist below can check
// "is this blob in our store" rather than merely "is this hostname shaped
// like a Vercel Blob store" — anyone with their own (free) Vercel account can
// get a hostname ending in `.public.blob.vercel-storage.com` too, just not
// this one, so the looser suffix-only check let any authenticated write-
// access user point attachmentUrl/logoUrl at a completely different store
// they control, skipping every size/type/magic-byte check the real upload
// routes enforce. Returns null (and callers then reject every URL) if the
// token isn't configured — no uploads can succeed without it anyway (see
// CLAUDE.md's Environment Variables table), so there's nothing legitimate to
// allow through in that case.
function ownBlobStoreHostname(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const match = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/);
  return match ? `${match[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

// Confines accepted/deletable blobs to this feature's own storage path —
// otherwise any authenticated user could pass an arbitrary URL (including a
// javascript: URI, since it's stored and later rendered as an <a href>) to be
// persisted as an attachment, or delete unrelated blobs in the same store.
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

// Best-effort cleanup — a failed delete (already gone, storage misconfigured,
// or a legacy base64 data URL from before Blob storage was wired up) must
// never block the caller's own DB operation.
export async function deleteAttachmentBlob(url: string | null | undefined) {
  if (!url || !url.startsWith("https://")) return;
  try {
    await del(url);
  } catch (error) {
    console.error("Failed to delete blob:", error);
  }
}
