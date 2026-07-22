// One-off backfill: rounds every existing Invoice/PurchaseBill's `total` to
// the nearest rupee and records the adjustment in the new `roundOff` column.
// Run once via `npx tsx prisma/backfillRoundOff.ts` — not wired into seed.ts.
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { computeRoundOff } from "../src/lib/roundOff";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

function statusFor(paidAmount: number, total: number) {
  if (total > 0 && paidAmount >= total) return "paid";
  if (paidAmount > 0) return "partial";
  return "unpaid";
}

async function backfillInvoices() {
  const invoices = await prisma.invoice.findMany({
    where: { roundOff: 0 },
    select: { id: true, subtotal: true, cgst: true, sgst: true, igst: true, total: true, paidAmount: true, status: true },
  });

  let changed = 0;
  for (const inv of invoices) {
    const rawTotal = inv.subtotal + inv.cgst + inv.sgst + inv.igst;
    const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
    if (roundOff === 0 && roundedTotal === inv.total) continue;
    const newStatus = statusFor(inv.paidAmount, roundedTotal);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { total: roundedTotal, roundOff, status: newStatus },
    });
    changed++;
    console.log(`Invoice ${inv.id}: ${inv.total} -> ${roundedTotal} (roundOff ${roundOff}, status ${inv.status} -> ${newStatus})`);
  }
  console.log(`Invoices: ${changed}/${invoices.length} updated.`);
}

async function backfillPurchaseBills() {
  const bills = await prisma.purchaseBill.findMany({
    where: { roundOff: 0 },
    select: { id: true, subtotal: true, taxAmount: true, discount: true, total: true, paidAmount: true, status: true },
  });

  let changed = 0;
  for (const bill of bills) {
    // Cancelled bills keep whatever total they were cancelled at — same
    // special-case the edit route already applies, so cancelling/un-cancelling
    // history isn't disturbed by this backfill.
    if (bill.status === "cancelled") continue;
    const rawTotal = bill.subtotal + bill.taxAmount - bill.discount;
    const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
    if (roundOff === 0 && roundedTotal === bill.total) continue;
    const newStatus = statusFor(bill.paidAmount, roundedTotal);
    await prisma.purchaseBill.update({
      where: { id: bill.id },
      data: { total: roundedTotal, roundOff, status: newStatus },
    });
    changed++;
    console.log(`PurchaseBill ${bill.id}: ${bill.total} -> ${roundedTotal} (roundOff ${roundOff}, status ${bill.status} -> ${newStatus})`);
  }
  console.log(`Purchase bills: ${changed}/${bills.length} updated.`);
}

async function main() {
  await backfillInvoices();
  await backfillPurchaseBills();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
