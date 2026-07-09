import { del } from "@vercel/blob";

// Confines accepted/deletable blobs to this feature's own storage path —
// otherwise any authenticated user could pass an arbitrary URL (including a
// javascript: URI, since it's stored and later rendered as an <a href>) to be
// persisted as an attachment, or delete unrelated blobs in the same store.
export function isPurchaseBillBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
      parsed.pathname.startsWith("/purchase-bills/")
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
