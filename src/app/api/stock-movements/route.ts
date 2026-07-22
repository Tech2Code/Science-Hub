import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";

// Admin-only bulk clear of the stock movement ledger — a temporary escape
// hatch for wiping historical/test movement rows; does not touch product
// stock quantities themselves.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    if (type !== "stock-ledger") {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    const { count } = await prisma.stockMovement.deleteMany({});

    await logActivity(auth.session.user.id, "empty_stock_ledger", `Cleared stock movement ledger: ${count} record(s) permanently deleted`);

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("DELETE /api/stock-movements error:", error);
    return NextResponse.json({ error: "Failed to clear stock ledger" }, { status: 500 });
  }
}
