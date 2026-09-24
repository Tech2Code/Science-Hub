// One-off backfill: fills `Return.createdByUserId` for credit notes created before that column
// existed (2026-09-24). Recovers the creator from the matching "create_return" ActivityLog entry
// (keyed by invoiceId, disambiguated by the credit note number appearing in its details text) —
// the exact lookup GET /api/credit-notes used to do live, on every request, before this column
// existed. A row with no matching log entry (e.g. the log was later deleted) is left null, same
// as it showed "—" under the old lookup. Idempotent: only touches rows with createdByUserId null,
// so it's safe to re-run.
//
// Run once via `npx tsx prisma/backfillReturnCreatedBy.ts` — not wired into seed.ts.
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const returns = await prisma.return.findMany({
    where: { createdByUserId: null },
    select: { id: true, invoiceId: true, creditNoteNumber: true },
  });

  console.log(`Found ${returns.length} credit note(s) with no creator on file.`);

  const invoiceIds = [...new Set(returns.map((r) => r.invoiceId))];
  const logs = invoiceIds.length
    ? await prisma.activityLog.findMany({
        where: { action: "create_return", entityId: { in: invoiceIds } },
        select: { entityId: true, details: true, userId: true },
      })
    : [];

  let updated = 0;
  let skipped = 0;
  for (const ret of returns) {
    const match = ret.creditNoteNumber
      ? logs.find((l) => l.entityId === ret.invoiceId && l.details.includes(`Credit note ${ret.creditNoteNumber} `))
      : undefined;
    if (!match) {
      skipped++;
      console.warn(`  SKIP ${ret.creditNoteNumber ?? ret.id}: no matching activity log entry found`);
      continue;
    }
    await prisma.return.update({ where: { id: ret.id }, data: { createdByUserId: match.userId } });
    updated++;
    console.log(`  OK   ${ret.creditNoteNumber ?? ret.id}: creator resolved`);
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped, ${returns.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
