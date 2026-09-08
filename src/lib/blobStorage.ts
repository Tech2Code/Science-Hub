import { del } from "@vercel/blob";

// Vercel refuses to reuse the same auto-injected variable name across two Storage connections in
// one project even when their environments don't overlap ("This project already uses
// PRIVATE_BLOB_READ_WRITE_TOKEN in Production or Preview. Set a prefix to avoid the conflict.") — so
// each private store's "Connect to Project" was given its own prefixed name instead of sharing one:
// LIVE_PRIVATE_BLOB_READ_WRITE_TOKEN (Vercel Production) and DEV_PRIVATE_BLOB_READ_WRITE_TOKEN
// (Vercel Preview). Local development isn't a Vercel-managed environment at all — it just reads
// whatever this machine's own .env names it, PRIVATE_BLOB_READ_WRITE_TOKEN, kept unprefixed there
// since one local file only ever needs one value. Only one of the three is ever actually set for a
// given place this code runs, so this just picks whichever exists, in that priority order.
export function getPrivateBlobToken(): string | undefined {
  return (
    process.env.LIVE_PRIVATE_BLOB_READ_WRITE_TOKEN ||
    process.env.DEV_PRIVATE_BLOB_READ_WRITE_TOKEN ||
    process.env.PRIVATE_BLOB_READ_WRITE_TOKEN
  );
}

// Derives a Blob store's exact hostname from its own read-write token, so the allowlist checks "is
// this blob in our store", not just "shaped like a Vercel Blob store" — a suffix-only check would
// let a user point attachmentUrl/logoUrl at a different store they control, skipping upload
// validation. Vercel's two access modes live under different hostname suffixes
// (*.public.blob.vercel-storage.com vs. *.private.blob.vercel-storage.com), so which suffix to
// build is a parameter, not a constant.
function ownBlobStoreHostname(token: string | undefined, suffix: "public" | "private"): string | null {
  const match = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/);
  return match ? `${match[1].toLowerCase()}.${suffix}.blob.vercel-storage.com` : null;
}

// Purchase-bill attachments live in a dedicated PRIVATE-access store (PRIVATE_BLOB_READ_WRITE_TOKEN)
// — separate from the app's original public store, since Vercel Blob's access mode is fixed
// permanently at store creation and the original store must stay public (it also holds the business
// logo, shown on the unauthenticated login page). Confines accepted/deletable blobs to this feature's
// own storage path — otherwise a user could pass an arbitrary URL (e.g. a javascript: URI later
// rendered as <a href>) or delete unrelated blobs.
export function isPurchaseBillBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ownHost = ownBlobStoreHostname(getPrivateBlobToken(), "private");
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
// business logo's own storage path — stays on the original public store.
export function isLogoBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ownHost = ownBlobStoreHostname(process.env.BLOB_READ_WRITE_TOKEN, "public");
    return (
      parsed.protocol === "https:" &&
      !!ownHost && parsed.hostname === ownHost &&
      parsed.pathname.startsWith("/logos/")
    );
  } catch {
    return false;
  }
}

// Best-effort cleanup — a failed delete (already gone, misconfigured, or a legacy base64 URL) must
// never block the caller's DB operation. Shared by purchase-bill attachments (private store) and
// the business logo (public store) — the URL's own hostname says which store it lives in, so the
// matching token is picked automatically rather than forcing one store's token onto both.
export async function deleteAttachmentBlob(url: string | null | undefined) {
  if (!url || !url.startsWith("https://")) return;
  try {
    const isPrivateStoreUrl = new URL(url).hostname.endsWith(".private.blob.vercel-storage.com");
    await del(url, isPrivateStoreUrl ? { token: getPrivateBlobToken() } : undefined);
  } catch (error) {
    console.error("Failed to delete blob:", error);
  }
}
