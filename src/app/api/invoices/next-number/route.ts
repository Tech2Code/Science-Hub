import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { previewNextDocumentNumber } from "@/lib/documentNumberPreview";

// Read-only preview of the invoice number the New Invoice page's next save would get — always
// computed for "today", since Invoice.date always defaults to creation time (see /api/invoices).
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const documentNumber = await previewNextDocumentNumber("invoice", new Date());
    return NextResponse.json({ documentNumber });
  } catch (error) {
    console.error("GET /api/invoices/next-number error:", error);
    return NextResponse.json({ error: "Failed to preview invoice number" }, { status: 500 });
  }
}
