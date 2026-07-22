import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSectionAccess("payments_received");
    if (!auth.ok) return auth.response;

    const payments = await prisma.payment.findMany({
      orderBy: { date: "desc" },
      take: 5000,
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            total: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}
