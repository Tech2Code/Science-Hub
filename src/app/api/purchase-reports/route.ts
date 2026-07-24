import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";

async function getPurchaseSummary() {
  const now = new Date();

  const months = Array.from({ length: 12 }, (_, idx) => {
    const i = 11 - idx;
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = start.toLocaleString("en-IN", { month: "short", year: "numeric" });
    return { start, end, label };
  });

  const result = await Promise.all(months.map(async ({ start, end, label }) => {
    const bills = await prisma.purchaseBill.findMany({
      where: { deletedAt: null, billDate: { gte: start, lt: end } },
      select: { total: true, paidAmount: true },
    });

    const totalSpend = bills.reduce((s, b) => s + b.total, 0);
    const paid = bills.reduce((s, b) => s + b.paidAmount, 0);
    return { month: label, count: bills.length, totalSpend, paid, payable: totalSpend - paid };
  }));

  return result;
}

async function getPurchaseOutstanding(startDate?: string, endDate?: string) {
  const now = new Date();
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const bills = await prisma.purchaseBill.findMany({
    where: {
      deletedAt: null,
      status: { in: ["unpaid", "partial"] },
      ...(Object.keys(dateFilter).length > 0 && { billDate: dateFilter }),
    },
    orderBy: { billDate: "asc" },
    include: { vendor: { select: { id: true, name: true } } },
  });

  return bills.map((b) => {
    const balance = b.total - b.paidAmount;
    const daysOverdue = b.dueDate
      ? Math.floor((now.getTime() - new Date(b.dueDate).getTime()) / 86400000)
      : null;
    let aging = "Current";
    if (daysOverdue !== null && daysOverdue > 0) {
      if (daysOverdue <= 30) aging = "1–30 days";
      else if (daysOverdue <= 60) aging = "31–60 days";
      else aging = "60+ days";
    }
    return {
      id: b.id, billNumber: b.billNumber, billDate: b.billDate, dueDate: b.dueDate,
      vendor: b.vendor, total: b.total, paidAmount: b.paidAmount, balance, status: b.status, aging,
    };
  });
}

async function getPurchaseByCategory() {
  const bills = await prisma.purchaseBill.findMany({
    where: { deletedAt: null },
    select: { category: true, total: true },
  });

  const totalSpend = bills.reduce((s, b) => s + b.total, 0);
  const byCategory: Record<string, { count: number; total: number }> = {};

  for (const b of bills) {
    const cat = b.category ?? "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].total += b.total;
  }

  return Object.entries(byCategory)
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalSpend: data.total,
      pct: totalSpend > 0 ? Math.round((data.total / totalSpend) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

async function getStockLedger() {
  const movements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, productId: true, productName: true, type: true, documentType: true, quantity: true,
      balanceAfter: true, reference: true, notes: true, createdAt: true,
      purchaseBill: { select: { billNumber: true } },
    },
  });

  return movements.map((m) => ({
    id: m.id,
    productId: m.productId,
    productName: m.productName || "(deleted product)",
    type: m.type,
    documentType: m.documentType,
    quantity: m.quantity,
    balanceAfter: m.balanceAfter,
    reference: m.reference,
    notes: m.notes,
    billNumber: m.purchaseBill?.billNumber ?? null,
    createdAt: m.createdAt,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSectionAccess("reports_purchases");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }

    if (type === "summary")      return NextResponse.json(await getPurchaseSummary());
    if (type === "outstanding")  return NextResponse.json(await getPurchaseOutstanding(startDate, endDate));
    if (type === "category")     return NextResponse.json(await getPurchaseByCategory());
    if (type === "stock-ledger") return NextResponse.json(await getStockLedger());

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/purchase-reports error:", error);
    return NextResponse.json({ error: "Failed to generate purchase report" }, { status: 500 });
  }
}
