import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { previewNextDocumentNumber } from "@/lib/documentNumberPreview";
import { istDayStartUtc } from "@/lib/validation";

// Read-only preview of the credit-note number the invoice detail page's Record Return modal would
// get. Accepts `?date=` since a return's FY segment is derived from its own user-picked return
// date, not "now" (see /api/invoices/[id]/returns). Numbering is a single global sequence per FY,
// independent of which invoice the return is being recorded against.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const dateParam = new URL(request.url).searchParams.get("date");
    const effectiveDate = dateParam ? istDayStartUtc(dateParam) : new Date();
    if (isNaN(effectiveDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const documentNumber = await previewNextDocumentNumber("credit_note", effectiveDate);
    return NextResponse.json({ documentNumber });
  } catch (error) {
    console.error("GET /api/credit-notes/next-number error:", error);
    return NextResponse.json({ error: "Failed to preview credit note number" }, { status: 500 });
  }
}
