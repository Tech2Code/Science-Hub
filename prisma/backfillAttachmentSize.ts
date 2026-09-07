// One-off backfill: fills `PurchaseBill.attachmentSize` for bills uploaded
// before that column existed. Reads each attachment's byte size from Blob
// storage via a HEAD request (Content-Length) — no re-upload, no data change
// to the file itself. Idempotent: only touches rows that have an attachment
// URL but a null size, so it's safe to re-run.
//
// Run once via `npx tsx prisma/backfillAttachmentSize.ts` — not wired into seed.ts.
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

// Vercel Blob serves public URLs with a Content-Length header. A HEAD avoids
// downloading the file body. Some CDNs omit Content-Length on HEAD; fall back
// to a 1-byte ranged GET whose Content-Range tail ("bytes 0-0/12345") carries
// the true total size.
async function fetchBlobSize(url: string): Promise<number | null> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      const len = head.headers.get("content-length");
      if (len && Number.isFinite(Number(len))) return Number(len);
    }
  } catch {
    // fall through to the ranged GET
  }
  try {
    const ranged = await fetch(url, { headers: { Range: "bytes=0-0" } });
    // 206 Partial Content → Content-Range: "bytes 0-0/<total>"
    const contentRange = ranged.headers.get("content-range");
    if (contentRange) {
      const total = contentRange.split("/")[1];
      if (total && Number.isFinite(Number(total))) return Number(total);
    }
    // Server ignored Range and sent the whole thing — Content-Length is then the full size.
    const len = ranged.headers.get("content-length");
    if (ranged.ok && len && Number.isFinite(Number(len))) return Number(len);
  } catch {
    // give up on this one
  }
  return null;
}

async function main() {
  const bills = await prisma.purchaseBill.findMany({
    where: { attachmentUrl: { not: null }, attachmentSize: null },
    select: { id: true, billNumber: true, attachmentUrl: true, attachmentName: true },
  });

  console.log(`Found ${bills.length} bill(s) with an attachment but no stored size.`);

  let updated = 0;
  let failed = 0;
  for (const bill of bills) {
    const url = bill.attachmentUrl!;
    const size = await fetchBlobSize(url);
    if (size == null) {
      failed++;
      console.warn(`  SKIP ${bill.billNumber} (${bill.id}): could not determine size for ${bill.attachmentName ?? url}`);
      continue;
    }
    await prisma.purchaseBill.update({ where: { id: bill.id }, data: { attachmentSize: size } });
    updated++;
    console.log(`  OK   ${bill.billNumber}: ${bill.attachmentName ?? url} -> ${size} bytes`);
  }

  console.log(`\nDone. ${updated} updated, ${failed} skipped, ${bills.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
