// One-off cleanup: run strictly AFTER prisma/migratePurchaseBillAttachmentsToPrivate.ts has
// already succeeded (every PurchaseBill.attachmentUrl points at the new private store). That
// migration could copy each attachment to the new private store and update the DB, but couldn't
// delete the old public blob (its `del()` call needs the original store's own
// BLOB_READ_WRITE_TOKEN, which was still marked "Sensitive" in Vercel at the time and so couldn't
// be pulled) — leaving every migrated attachment's old public copy live and publicly fetchable by
// anyone who has that URL. This script finishes the job: lists everything still sitting under
// "purchase-bills/" in the original (public) store and deletes it.
//
// Safety check before deleting anything: confirms zero PurchaseBill rows still reference the old
// public store's hostname. If that check fails, nothing is deleted — re-run the migration script
// first.
//
// Requires .env.production.local (or whichever env file is passed) to have a REAL
// BLOB_READ_WRITE_TOKEN value (not "[SENSITIVE]") — see the migration script's own comments for how
// to temporarily un-mark a var as Sensitive in the Vercel dashboard so `vercel env pull` can fetch it.
//
// Run via: npx tsx prisma/cleanupOldPublicPurchaseBillAttachments.ts .env.production.local
import { PrismaClient } from "@prisma/client";
import { list, del } from "@vercel/blob";
import { config } from "dotenv";
import { resolve } from "path";

const envArg = process.argv[2];
const envPath = envArg ? resolve(process.cwd(), envArg) : resolve(__dirname, "../.env");
config({ path: envPath, override: true });
console.log(`Using env file: ${envPath}`);

const prisma = new PrismaClient();
const PUBLIC_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function main() {
  if (!PUBLIC_BLOB_TOKEN || PUBLIC_BLOB_TOKEN === "[SENSITIVE]") {
    console.error(
      "BLOB_READ_WRITE_TOKEN is missing or still a [SENSITIVE] placeholder.\n" +
      "Temporarily uncheck \"Sensitive\" on BLOB_READ_WRITE_TOKEN in the Vercel dashboard, re-run\n" +
      "`vercel env pull`, then re-run this script."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Target database host: ${new URL(process.env.DATABASE_URL || "").hostname}`);

  const stillReferencingOldStore = await prisma.purchaseBill.count({
    where: {
      attachmentUrl: { not: null },
      NOT: { attachmentUrl: { contains: ".private.blob.vercel-storage.com" } },
    },
  });
  if (stillReferencingOldStore > 0) {
    console.error(
      `Refusing to delete anything: ${stillReferencingOldStore} bill(s) still have an attachmentUrl ` +
      "that isn't the private store. Run prisma/migratePurchaseBillAttachmentsToPrivate.ts first."
    );
    process.exitCode = 1;
    return;
  }
  console.log("Safety check passed: every bill's attachmentUrl already points at the private store.");

  let cursor: string | undefined;
  let listed = 0;
  let deleted = 0;
  let failed = 0;
  do {
    const page = await list({ prefix: "purchase-bills/", cursor, limit: 1000, token: PUBLIC_BLOB_TOKEN });
    listed += page.blobs.length;
    for (const blob of page.blobs) {
      try {
        await del(blob.url, { token: PUBLIC_BLOB_TOKEN });
        deleted++;
        console.log(`  OK   deleted ${blob.pathname}`);
      } catch (error) {
        failed++;
        console.error(`  FAIL ${blob.pathname}`, error);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  console.log(`\nDone. ${listed} old blob(s) found, ${deleted} deleted, ${failed} failed.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
