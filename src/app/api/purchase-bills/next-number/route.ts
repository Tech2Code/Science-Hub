import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { previewNextDocumentNumber } from "@/lib/documentNumberPreview";
import { istDayStartUtc } from "@/lib/validation";

// Read-only preview of the bill number the New Purchase Bill page's next save would get. Accepts
// `?billDate=` since (unlike Invoice) a bill's FY segment is derived from its own user-picked
// billDate, not "now" — a bill can be entered late for an earlier period (see /api/purchase-bills).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const billDateParam = new URL(request.url).searchParams.get("billDate");
    const effectiveBillDate = billDateParam ? istDayStartUtc(billDateParam) : new Date();
    if (isNaN(effectiveBillDate.getTime())) {
      return NextResponse.json({ error: "Invalid bill date" }, { status: 400 });
    }

    const documentNumber = await previewNextDocumentNumber("purchase_bill", effectiveBillDate);
    return NextResponse.json({ documentNumber });
  } catch (error) {
    console.error("GET /api/purchase-bills/next-number error:", error);
    return NextResponse.json({ error: "Failed to preview bill number" }, { status: 500 });
  }
}
