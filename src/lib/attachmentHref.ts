// Purchase-bill attachments are uploaded as private Vercel Blobs (access: "private") — the raw
// Blob URL alone no longer resolves for an unauthenticated request, so the browser must never be
// given it directly. Both hrefs below end in the real filename rather than a fixed route segment
// like "attachment" — browsers commonly fall back to the URL's last path segment (not the
// Content-Disposition filename) when naming a file saved from an inline viewer, so a URL that ends
// in the route's own name shows up as a file literally called "attachment" once saved.

// Preferred once the bill has a saved id and this is still its current attachment (detail page,
// list page, and the Edit form whenever the attachment hasn't just been replaced) — short, and the
// blob's own storage pathname never reaches the client at all.
export function purchaseBillAttachmentByIdHref(billId: string, filename: string): string {
  return `/api/purchase-bills/${billId}/attachment/${encodeURIComponent(filename)}`;
}

// For a just-uploaded, not-yet-saved replacement file (Edit form only) — there's no saved row to
// key off yet, so this addresses the blob directly by its own (already short) storage pathname
// instead: "purchase-bills/<8-hex-folder>/<filename>" (see
// src/app/api/purchase-bills/upload/route.ts) becomes "/api/purchase-bills/attachment/<folder>/<filename>".
export function purchaseBillAttachmentPendingHref(blobUrl: string): string {
  const segments = new URL(blobUrl).pathname.split("/").filter(Boolean); // ["purchase-bills", folder, filename]
  const folder = segments[1] ?? "";
  const filename = segments[2] ?? "attachment";
  return `/api/purchase-bills/attachment/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
}
