import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { deleteAttachmentBlob, isPurchaseBillBlobUrl, getPrivateBlobToken } from "@/lib/blobStorage";
import { requireWriteAccess } from "@/lib/apiAuth";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

// `file.type` is spoofable — verify actual bytes, not the client label.
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
      // RIFF container (bytes 0-3) alone also matches .wav/.avi — check the "WEBP" fourcc at
      // offset 8-11 too, or a spoofed non-image RIFF file would pass as a valid attachment.
      return hex(0) === "52" && hex(1) === "49" && hex(2) === "46" && hex(3) === "46"
        && hex(8) === "57" && hex(9) === "45" && hex(10) === "42" && hex(11) === "50";
    case "image/heic": {
      // ISO base media "ftyp" box: bytes 4-7 = "ftyp", bytes 8-11 = the 4-char major brand.
      // Checking the container marker alone also matches any other ISO-BMFF file (.mp4/.mov/.avif/…)
      // with a spoofed Content-Type — check the brand too against the real-world HEIC/HEIF brand set
      // (iOS Camera writes "heic"; burst/Live Photo sequences use "heix"/"hevc"/"mif1"/"msf1"/etc.).
      const isFtyp = hex(4) === "66" && hex(5) === "74" && hex(6) === "79" && hex(7) === "70";
      if (!isFtyp) return false;
      const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
      return ["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"].includes(brand);
    }
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

    const privateToken = getPrivateBlobToken();
    if (!privateToken) {
      return NextResponse.json({ error: "Attachment storage is not configured." }, { status: 503 });
    }

    // A short per-upload random folder (not a suffix on the filename itself) guarantees a unique
    // pathname — two unrelated bills whose vendor happened to name both attachments the same thing
    // (common with generic scanner/invoice filenames) never collide or silently overwrite each
    // other, while the visible filename stays exactly what was uploaded.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
    const uploadId = randomBytes(4).toString("hex");
    const blob = await put(`purchase-bills/${uploadId}/${safeName}`, file, {
      access: "private",
      token: privateToken,
    });

    return NextResponse.json({ url: blob.url, name: file.name, size: file.size });
  } catch (error) {
    console.error("POST /api/purchase-bills/upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

// Discards an upload never attached to a saved bill, otherwise it sits in Blob storage forever.
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
