import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";

// Distinct units already used across Products/Invoice items/Purchase-Bill items —
// merged client-side (useUnitSuggestions) with each form's static suggestion list,
// so a custom unit typed once (e.g. "500 GM") becomes a one-click suggestion
// everywhere afterwards instead of having to be retyped every time.
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    // groupBy runs as a real SQL GROUP BY — findMany's `distinct` is applied in Prisma 5's query
    // engine after streaming every matching row, i.e. every line item ever written.
    const [products, invoiceItems, purchaseBillItems] = await Promise.all([
      prisma.product.groupBy({ by: ["unit"], where: { deletedAt: null } }),
      prisma.invoiceItem.groupBy({ by: ["unit"], where: { invoice: { deletedAt: null } } }),
      prisma.purchaseBillItem.groupBy({ by: ["unit"], where: { purchaseBill: { deletedAt: null } } }),
    ]);

    const units = new Set<string>();
    for (const row of [...products, ...invoiceItems, ...purchaseBillItems]) {
      const u = row.unit?.trim();
      if (u) units.add(u);
    }

    return NextResponse.json({ units: Array.from(units).sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    console.error("GET /api/units error:", error);
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
  }
}
