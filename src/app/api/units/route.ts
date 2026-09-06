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

    const [products, invoiceItems, purchaseBillItems] = await Promise.all([
      prisma.product.findMany({ where: { deletedAt: null }, select: { unit: true }, distinct: ["unit"] }),
      prisma.invoiceItem.findMany({ where: { invoice: { deletedAt: null } }, select: { unit: true }, distinct: ["unit"] }),
      prisma.purchaseBillItem.findMany({ where: { purchaseBill: { deletedAt: null } }, select: { unit: true }, distinct: ["unit"] }),
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
