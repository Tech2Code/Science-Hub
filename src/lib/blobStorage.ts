import { del } from "@vercel/blob";

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
