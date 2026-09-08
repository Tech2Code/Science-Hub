import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireSession } from "@/lib/apiAuth";
import { getPrivateBlobToken } from "@/lib/blobStorage";

// A CR/LF or quote in a Content-Disposition filename could inject extra headers or break the
// value — same header-injection class the SMTP send routes already guard against.
function safeFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"]/g, "").trim().slice(0, 200);
  return cleaned || "attachment";
}

// Serves a just-uploaded, not-yet-saved purchase-bill attachment (Edit form previewing a
// replacement file before Save) — there's no saved PurchaseBill row yet to key off, so this
// addresses the private blob directly by its own storage pathname
// ("purchase-bills/<8-hex-folder>/<filename>", see src/app/api/purchase-bills/upload/route.ts)
// instead of a full URL. Vercel Blob's get() accepts a bare pathname directly (resolved against
// whichever store the token belongs to), so the pathname is reconstructed here rather than trusting
// a client-supplied full URL — the client can only ever reach something already confined to
// "purchase-bills/", never an arbitrary blob elsewhere.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ folder: string; filename: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { folder, filename } = await params;
    // `filename` is matched against the same safe-character allowlist the upload route sanitizes
    // every stored filename to (see safeName in src/app/api/purchase-bills/upload/route.ts) — a
    // real stored pathname can never contain "/", "..", or other characters outside this set, so
    // rejecting anything else closes off path-manipulation via this segment defensively, even
    // though Vercel Blob treats pathnames as opaque keys rather than filesystem paths.
    if (!/^[a-f0-9]{8}$/.test(folder) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return NextResponse.json({ error: "Invalid attachment path" }, { status: 400 });
    }

    const privateToken = getPrivateBlobToken();
    if (!privateToken) {
      // See the sibling [id]/attachment/[filename] route for why this must fail fast instead of
      // letting @vercel/blob's get() silently fall through to the public store's token.
      return NextResponse.json({ error: "Attachment storage is not configured." }, { status: 503 });
    }

    const result = await get(`purchase-bills/${folder}/${filename}`, {
      access: "private",
      token: privateToken,
    });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeFilename(filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/purchase-bills/attachment/[folder]/[filename] error:", error);
    return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 });
  }
}
