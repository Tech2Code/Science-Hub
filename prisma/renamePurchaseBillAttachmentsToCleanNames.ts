// One-off cleanup: renames every already-migrated PurchaseBill attachment (currently stored under
// the old timestamp+suffix pathname pattern) to the new, shorter pattern new uploads use going
// forward — "purchase-bills/<8-hex-char-folder>/<original-filename>" (see
// src/app/api/purchase-bills/upload/route.ts). Only the storage *pathname* changes here; the
// DB-stored attachmentName (what the UI/downloads have always shown) is unaffected and is in fact
// the source of truth this script uses to rebuild a clean filename.
//
// For each bill: downloads the current attachment (private store, needs the token), re-uploads it
// under the new short pathname, updates the DB row's attachmentUrl, then deletes the old blob.
// Skips any bill whose attachmentUrl isn't on the private store yet (nothing to rename).
//
// NOT strictly idempotent — a second run just re-processes whatever's there again (wasteful, not
// harmful). Run via: npx tsx prisma/renamePurchaseBillAttachmentsToCleanNames.ts .env.production.local
import { PrismaClient } from "@prisma/client";
import { get, put, del } from "@vercel/blob";
import { randomBytes } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

const envArg = process.argv[2];
const envPath = envArg ? resolve(process.cwd(), envArg) : resolve(__dirname, "../.env");
config({ path: envPath, override: true });
console.log(`Using env file: ${envPath}`);

const prisma = new PrismaClient();
const PRIVATE_BLOB_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
}

async function main() {
  if (!PRIVATE_BLOB_TOKEN) {
    console.error("PRIVATE_BLOB_READ_WRITE_TOKEN is not set — see the migration script's comments.");
    process.exitCode = 1;
    return;
  }

  console.log(`Target database host: ${new URL(process.env.DATABASE_URL || "").hostname}`);

  const bills = await prisma.purchaseBill.findMany({
    where: { attachmentUrl: { contains: ".private.blob.vercel-storage.com" } },
    select: { id: true, billNumber: true, attachmentUrl: true, attachmentName: true },
  });

  console.log(`Found ${bills.length} bill(s) on the private store to rename.`);

  let renamed = 0;
  let failed = 0;
  for (const bill of bills) {
    const oldUrl = bill.attachmentUrl!;
    try {
      const result = await get(oldUrl, { access: "private", token: PRIVATE_BLOB_TOKEN });
      if (!result || result.statusCode !== 200) throw new Error("Could not read existing attachment");
      const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());

      const safeName = sanitizeName(bill.attachmentName || "attachment.pdf");
      const uploadId = randomBytes(4).toString("hex");
      const uploaded = await put(`purchase-bills/${uploadId}/${safeName}`, bytes, {
        access: "private",
        token: PRIVATE_BLOB_TOKEN,
      });

      await prisma.purchaseBill.update({ where: { id: bill.id }, data: { attachmentUrl: uploaded.url } });
      await del(oldUrl, { token: PRIVATE_BLOB_TOKEN });
      renamed++;
      console.log(`  OK   ${bill.billNumber} (${bill.id}): -> purchase-bills/${uploadId}/${safeName}`);
    } catch (error) {
      failed++;
      console.error(`  FAIL ${bill.billNumber} (${bill.id})`, error);
    }
  }

  console.log(`\nDone. ${renamed} renamed, ${failed} failed, ${bills.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
