import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { date: "desc" },
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
