// One-off migration: moves every existing PurchaseBill attachment from the app's current
// (public-access) Vercel Blob store into a dedicated, genuinely PRIVATE-access store.
//
// Vercel Blob's access mode (public vs. private) is fixed permanently at store *creation* and
// cannot be converted afterwards (https://vercel.com/docs/vercel-blob#private-and-public-storage)
// — the app's existing store was created public (it's also used for the business logo, which must
// stay public since it's shown on the unauthenticated login page), so attachments can't just be
// flipped to private in place. This script requires a SECOND store that was created with access
// mode "Private" in the Vercel dashboard, connected to this project, with its own read-write token
// saved locally as PRIVATE_BLOB_READ_WRITE_TOKEN in .env.
//
// For each bill: downloads the current (still-public) attachment, re-uploads it to the private
// store (access: "private"), updates the DB row's attachmentUrl to the new URL, then deletes the
// old public blob. Includes soft-deleted bills — the Bin retains purchase bills indefinitely (see
// CLAUDE.md's Recycle Bin section), so a bill sitting in the bin still needs its attachment moved.
//
// NOT strictly idempotent — a second run would just re-download+re-upload+re-delete from whatever
// attachmentUrl is current (wasteful but harmless), so there's no need to run it more than once.
//
// This app's local .env points at a separate dev database, not production — running the script
// with no argument only touches whatever bills exist there. To migrate the REAL live bills, pull
// production's env vars into their own file first (never overwrite the local .env dev DB with
// these) and pass that file's path as the one CLI argument:
//   npx vercel env pull .env.production.local --environment=production
//   npx tsx prisma/migratePurchaseBillAttachmentsToPrivate.ts .env.production.local
// Run once (per environment migrated).
import { PrismaClient } from "@prisma/client";
import { put, del } from "@vercel/blob";
import { config } from "dotenv";
import { resolve } from "path";

const envArg = process.argv[2];
const envPath = envArg ? resolve(process.cwd(), envArg) : resolve(__dirname, "../.env");
// override: true — tsx (and some Node versions) auto-load a plain `.env` in the cwd before this
// script's own code runs; without override, dotenv silently keeps that first-loaded value instead
// of the one this script explicitly asked for, which — undetected — pointed an earlier run of this
// script at the wrong (dev) database despite passing .env.production.local on the command line.
config({ path: envPath, override: true });
console.log(`Using env file: ${envPath}`);

const prisma = new PrismaClient();
const PRIVATE_BLOB_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

async function main() {
  if (!PRIVATE_BLOB_TOKEN) {
    console.error(
      "PRIVATE_BLOB_READ_WRITE_TOKEN is not set.\n" +
      "Create a dedicated PRIVATE-access Vercel Blob store first (Storage tab -> Create Database ->\n" +
      "Blob -> Private), connect it to this project, copy its read-write token into .env as\n" +
      "PRIVATE_BLOB_READ_WRITE_TOKEN, then re-run this script."
    );
    process.exitCode = 1;
    return;
  }

  try {
    console.log(`Target database host: ${new URL(process.env.DATABASE_URL || "").hostname}`);
  } catch {
    console.log("Target database host: (could not parse DATABASE_URL)");
  }
  console.log(`Total purchase bills in this database: ${await prisma.purchaseBill.count()}`);

  const bills = await prisma.purchaseBill.findMany({
    where: { attachmentUrl: { not: null } },
    select: { id: true, billNumber: true, attachmentUrl: true, attachmentName: true },
  });

  console.log(`Found ${bills.length} bill(s) with an attachment to migrate to private storage.`);

  let migrated = 0;
  let failed = 0;
  for (const bill of bills) {
    const oldUrl = bill.attachmentUrl!;
    try {
      const res = await fetch(oldUrl);
      if (!res.ok) throw new Error(`Could not download existing attachment: HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());

      const pathname = new URL(oldUrl).pathname.replace(/^\/+/, "");
      const uploaded = await put(pathname, bytes, {
        access: "private",
        addRandomSuffix: true,
        token: PRIVATE_BLOB_TOKEN,
      });

      await prisma.purchaseBill.update({ where: { id: bill.id }, data: { attachmentUrl: uploaded.url } });
      // Explicit token, not the SDK's default resolution: when a VERCEL_OIDC_TOKEN + BLOB_STORE_ID
      // are both present (true for any `vercel env pull`'d file), the SDK prefers OIDC over
      // BLOB_READ_WRITE_TOKEN — and a locally-pulled OIDC token is always "development"-scoped, which
      // this project's OIDC settings reject, failing the delete even though a static token would work.
      await del(oldUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      migrated++;
      console.log(`  OK   ${bill.billNumber} (${bill.id}): ${bill.attachmentName ?? oldUrl}`);
    } catch (error) {
      failed++;
      console.error(`  FAIL ${bill.billNumber} (${bill.id}): ${bill.attachmentName ?? oldUrl}`, error);
    }
  }

  console.log(`\nDone. ${migrated} migrated, ${failed} failed, ${bills.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
