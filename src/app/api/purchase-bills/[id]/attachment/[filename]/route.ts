import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { getPrivateBlobToken } from "@/lib/blobStorage";

// A CR/LF or quote in a Content-Disposition filename could inject extra headers or break the
// value — same header-injection class the SMTP send routes already guard against.
function safeFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"]/g, "").trim().slice(0, 200);
  return cleaned || "attachment";
}

// The [filename] segment is purely cosmetic — it makes the URL itself end in the real filename
// instead of the fixed word "attachment", since browsers commonly derive a saved file's name from
// the URL's last path segment rather than the Content-Disposition header when viewing/saving from
// an inline viewer. The actual content always comes from the bill's own saved attachmentUrl/Name —
// this route never trusts the [filename] segment for anything but the URL's appearance.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const bill = await prisma.purchaseBill.findUnique({
      where: { id },
      select: { attachmentUrl: true, attachmentName: true },
    });
    if (!bill?.attachmentUrl) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const privateToken = getPrivateBlobToken();
    if (!privateToken) {
      // @vercel/blob's get() doesn't throw when `token` is undefined — it silently falls through to
      // OIDC/BLOB_READ_WRITE_TOKEN (the *public* logo store's token) instead, which would look up
      // this private pathname against the wrong store and surface as a confusing 404 rather than a
      // clear config error. Fail fast instead, same as the upload route already does.
      return NextResponse.json({ error: "Attachment storage is not configured." }, { status: 503 });
    }

    const result = await get(bill.attachmentUrl, { access: "private", token: privateToken });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const filename = safeFilename(bill.attachmentName || result.blob.pathname.split("/").pop() || "attachment");

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/purchase-bills/[id]/attachment/[filename] error:", error);
    return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 });
  }
}
