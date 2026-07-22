import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { deleteAttachmentBlob, isPurchaseBillBlobUrl } from "@/lib/blobStorage";
import { requireWriteAccess } from "@/lib/apiAuth";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

// `file.type` is whatever the browser reports and is trivially spoofable —
// this store is public-access, so check the actual file bytes rather than
// trusting the client label before anything gets served back out publicly.
function matchesDeclaredType(bytes: Uint8Array, type: string): boolean {
  const hex = (n: number) => bytes[n]?.toString(16).padStart(2, "0");
  switch (type) {
    case "application/pdf":
      return hex(0) === "25" && hex(1) === "50" && hex(2) === "44" && hex(3) === "46"; // %PDF
    case "image/jpeg":
      return hex(0) === "ff" && hex(1) === "d8" && hex(2) === "ff";
    case "image/png":
      return hex(0) === "89" && hex(1) === "50" && hex(2) === "4e" && hex(3) === "47";
    case "image/webp":
      return hex(0) === "52" && hex(1) === "49" && hex(2) === "46" && hex(3) === "46"; // RIFF (WEBP checked at offset 8, close enough to rule out spoofing)
    case "image/heic":
      // ISO base media "ftyp" box — brand bytes vary (heic/heix/mif1/…), so
      // just confirm the container marker rather than every known brand.
      return hex(4) === "66" && hex(5) === "74" && hex(6) === "79" && hex(7) === "70";
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG or WEBP files are allowed" }, { status: 400 });
    }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!matchesDeclaredType(header, file.type)) {
      return NextResponse.json({ error: "File content doesn't match its type — upload a genuine PDF or image." }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
    const blob = await put(`purchase-bills/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error) {
    console.error("POST /api/purchase-bills/upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

// Discards an uploaded attachment that was never attached to a saved bill
// (e.g. the user uploaded a file on the create form, then removed it before
// submitting) — without this it would sit in Blob storage forever.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { url } = await req.json();
    if (typeof url !== "string" || !isPurchaseBillBlobUrl(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    await deleteAttachmentBlob(url);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error("DELETE /api/purchase-bills/upload error:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
