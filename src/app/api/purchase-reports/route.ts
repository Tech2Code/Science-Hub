import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getPurchaseSummary() {
  const now = new Date();
  const result: { month: string; count: number; totalSpend: number; paid: number; payable: number }[] = [];

  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = start.toLocaleString("en-IN", { month: "short", year: "numeric" });

    const bills = await prisma.purchaseBill.findMany({
      where: { deletedAt: null, billDate: { gte: start, lt: end } },
      select: { total: true, paidAmount: true },
    });

    const totalSpend = bills.reduce((s, b) => s + b.total, 0);
    const paid = bills.reduce((s, b) => s + b.paidAmount, 0);
    result.push({ month: label, count: bills.length, totalSpend, paid, payable: totalSpend - paid });
  }

  return result;
}

async function getPurchaseOutstanding() {
  const now = new Date();
  const bills = await prisma.purchaseBill.findMany({
    where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "summary")     return NextResponse.json(await getPurchaseSummary());
    if (type === "outstanding") return NextResponse.json(await getPurchaseOutstanding());
    if (type === "category")    return NextResponse.json(await getPurchaseByCategory());

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/purchase-reports error:", error);
    return NextResponse.json({ error: "Failed to generate purchase report" }, { status: 500 });
  }
}
