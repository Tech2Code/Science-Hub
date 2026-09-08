import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { isPurchaseBillBlobUrl } from "@/lib/blobStorage";
import { requireSession } from "@/lib/apiAuth";

// A CR/LF or quote in a Content-Disposition filename could inject extra headers or break the
// value — same header-injection class the SMTP send routes already guard against.
function safeFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"]/g, "").trim().slice(0, 200);
  return cleaned || "attachment";
}

// Purchase-bill attachments live in a dedicated PRIVATE-access Vercel Blob store
// (PRIVATE_BLOB_READ_WRITE_TOKEN) — the raw blob URL doesn't resolve for an unauthenticated
// request. This route is the only way a client can read one: it checks the caller has a session,
// then fetches the blob server-side (using this app's own private-store token) and streams it back.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const url = req.nextUrl.searchParams.get("url");
    if (!url || !isPurchaseBillBlobUrl(url)) {
      return NextResponse.json({ error: "Invalid attachment url" }, { status: 400 });
    }

    const result = await get(url, { access: "private", token: process.env.PRIVATE_BLOB_READ_WRITE_TOKEN });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const nameParam = req.nextUrl.searchParams.get("name");
    const filename = safeFilename(nameParam || result.blob.pathname.split("/").pop() || "attachment");

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/purchase-bills/attachment error:", error);
    return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 });
  }
}
