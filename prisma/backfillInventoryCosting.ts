// One-off backfill: runs the weighted-average-cost (WAC) replay (src/lib/inventoryCosting.ts) over
// EVERY product that has ever appeared on an invoice or a return, filling in
// InvoiceItem.costPrice/costSource and ReturnItem.costPrice for every historical row — these were
// never populated for anything created before this feature (2026-09-15).
//
// Full all-time history, not just the current year — this business only started using the app this
// financial year, so the whole dataset is small and a full backfill is cheap.
//
// Idempotent: recostProducts() always replays and overwrites a product's full history from
// scratch, so re-running this script (e.g. after fixing a data issue) is always safe.
//
// Run once via `npx tsx prisma/backfillInventoryCosting.ts` (add --dry-run to only report what
// WOULD change, without writing anything).
import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { recostProducts, costCustomLineItems } from "../src/lib/inventoryCosting";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const productIds = await prisma.$queryRaw<Array<{ productId: string }>>`
    SELECT DISTINCT "productId" FROM "InvoiceItem" WHERE "productId" IS NOT NULL
    UNION
    SELECT DISTINCT "productId" FROM "ReturnItem" WHERE "productId" IS NOT NULL
  `;
  console.log(`Found ${productIds.length} product(s) with sale/return history.`);

  if (dryRun) {
    const beforeInvoice = await prisma.invoiceItem.aggregate({ _count: { costPrice: true } });
    const beforeReturn = await prisma.returnItem.aggregate({ _count: { costPrice: true } });
    console.log(`[dry-run] Currently costed: ${beforeInvoice._count.costPrice} invoice item(s), ${beforeReturn._count.costPrice} return item(s). No writes will be made.`);
    console.log(`[dry-run] Would replay ${productIds.length} product(s)' full history. Re-run without --dry-run to actually write.`);
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const { productId } of productIds) {
    // Not wrapped in a $transaction — each product's replay is independent and idempotent
    // (recostProducts always overwrites from a fresh full replay), so a plain client call avoids
    // the pooled-connection transaction-timeout flakiness a long-running loop of short transactions
    // can hit against Neon; a re-run after any interruption is always safe.
    await recostProducts(prisma as unknown as Prisma.TransactionClient, [productId]);
    done++;
    if (done % 20 === 0 || done === productIds.length) {
      console.log(`  ${done}/${productIds.length} products recosted`);
    }
  }

  // Custom (no-catalog) line items are invisible to recostProducts (it's keyed by productId) — a
  // separate global sweep costs every such line at its own net rate (assumed 0% margin), see
  // costCustomLineItems() in src/lib/inventoryCosting.ts for the reasoning.
  await costCustomLineItems(prisma as unknown as Prisma.TransactionClient);
  console.log("Custom (no-catalog) line items costed at their own net rate.");

  const afterInvoice = await prisma.invoiceItem.groupBy({ by: ["costSource"], _count: { _all: true }, _sum: { quantity: true } });
  console.log("\nDone. InvoiceItem costSource breakdown:", afterInvoice.map((r) => ({ costSource: r.costSource, items: r._count._all, qty: r._sum.quantity })));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
