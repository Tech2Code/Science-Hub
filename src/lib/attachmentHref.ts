// Purchase-bill attachments are uploaded as private Vercel Blobs (access: "private") — the raw
// Blob URL alone no longer resolves for an unauthenticated request, so the browser must never be
// given it directly. This builds the href for the authenticated proxy route instead
// (GET /api/purchase-bills/attachment), which streams the blob content server-side after checking
// the caller has a session. Kept in its own client-safe module (no @vercel/blob import) so it can
// be used from client components without pulling server-only Blob SDK code into the browser bundle.
export function purchaseBillAttachmentHref(url: string, filename?: string | null): string {
  const params = new URLSearchParams({ url });
  if (filename) params.set("name", filename);
  return `/api/purchase-bills/attachment?${params.toString()}`;
}
