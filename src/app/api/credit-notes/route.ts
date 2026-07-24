import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const creditNotes = await prisma.return.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 5000,
      include: {
        items: true,
        invoice: {
          select: {
            invoiceNumber: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json(creditNotes);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch credit notes" }, { status: 500 });
  }
}
