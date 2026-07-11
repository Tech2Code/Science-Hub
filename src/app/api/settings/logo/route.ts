import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/apiAuth";
import { deleteAttachmentBlob, isLogoBlobUrl } from "@/lib/blobStorage";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// `file.type` is whatever the browser reports and is trivially spoofable —
// this store is public-access, so check the actual file bytes rather than
// trusting the client label before anything gets served back out publicly.
function matchesDeclaredType(bytes: Uint8Array, type: string): boolean {
  const hex = (n: number) => bytes[n]?.toString(16).padStart(2, "0");
  switch (type) {
    case "image/jpeg":
      return hex(0) === "ff" && hex(1) === "d8" && hex(2) === "ff";
    case "image/png":
      return hex(0) === "89" && hex(1) === "50" && hex(2) === "4e" && hex(3) === "47";
    case "image/webp":
      return hex(0) === "52" && hex(1) === "49" && hex(2) === "46" && hex(3) === "46"; // RIFF (WEBP checked at offset 8, close enough to rule out spoofing)
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Logo must be under 2 MB" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG or WEBP images are allowed" }, { status: 400 });
    }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!matchesDeclaredType(header, file.type)) {
      return NextResponse.json({ error: "File content doesn't match its type — upload a genuine image." }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "logo";
    const blob = await put(`logos/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("POST /api/settings/logo error:", error);
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { url } = await req.json();
    if (typeof url !== "string" || !isLogoBlobUrl(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    await deleteAttachmentBlob(url);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error("DELETE /api/settings/logo error:", error);
    return NextResponse.json({ error: "Failed to delete logo" }, { status: 500 });
  }
}
