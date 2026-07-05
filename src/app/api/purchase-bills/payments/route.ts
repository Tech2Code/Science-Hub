import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const payments = await prisma.purchasePayment.findMany({
      orderBy: { date: "desc" },
      include: {
        purchaseBill: {
          select: {
            billNumber: true,
            vendor: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET /api/purchase-bills/payments error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase payments" }, { status: 500 });
  }
}
