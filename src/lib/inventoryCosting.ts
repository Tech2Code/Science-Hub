import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// Weighted-Average-Cost (WAC) inventory costing — the single source of truth for
// InvoiceItem.costPrice, which the dashboard's Financial Summary sums for COGS/gross profit.
//
// WHY WAC, not "last purchase bill price as of sale date" (the prior approach in productCost.ts):
// a product's stock is fungible — once two purchases at different rates are mixed in the
// warehouse, there's no way to know which physical units a given sale came from. WAC blends every
// purchase's cost into a running average, weighted by quantity, so one unusual bill (a bulk order,
// an emergency top-up at a higher rate) can't distort the cost of the entire remaining stock the
// way "just use whatever the latest bill said" can.
//
// THE REPLAY: this app deliberately does not require stock to be non-negative before an invoice
// can be saved — a sale can be recorded before its replenishing purchase bill is ever entered
// (backorder), and dates can be backdated on any document at any time. So cost can't be computed
// once, frozen, and left alone: it must be recomputed by replaying a product's ENTIRE purchase +
// sale + return history in chronological DOCUMENT-DATE order (not creation order) every time
// something in that history changes. This module always replays a product's full history rather
// than trying to patch forward from one edit point — for this app's scale (tens of movements per
// product, not thousands) a full replay is cheap and it removes an entire class of "did I resume
// from the right point" bugs.
//
// FALLBACK: a sale that lands while the running WAC pool is empty (sold before any qualifying
// purchase, or an oversold/negative-stock line) has no real cost basis yet — it's costed at the
// product's current Product.purchasePrice as a placeholder (costSource: "fallback") instead of
// being left blank/zero. If a later purchase (even one entered afterward, or backdated to an
// earlier date) supplies real history, the next recompute silently upgrades that same line from
// "fallback" to "ledger" with the real WAC-derived cost — no separate backfill step needed.
//
// RETURNS: ReturnItem has no link back to the specific InvoiceItem it reverses (the schema doesn't
// carry one), so a return can't restore the exact frozen cost of the sale it's reversing. It's
// costed at the running average AT THE MOMENT OF THE RETURN instead — neither creating a paper
// profit nor a paper loss on the returned units, which is the best available approximation without
// a schema change to add that link.
//
// BATCHING: this runs inside the same transaction as the stock mutation that triggered it
// (batchAdjustStock, see src/lib/stockMovement.ts) — a transaction with a limited timeout. Fetching
// and writing per-product one at a time (3 reads + up to 2 writes EACH) made an invoice touching
// N distinct products issue ~5×N round-trips, which blew past Prisma's default 5s transaction
// timeout on an invoice with as few as ~15-20 distinct line items (confirmed: a 30-item invoice
// failed after 25s with a P2028 "transaction not found" error). Fetching every affected product's
// purchase/sale/return rows in three IN-list queries (not 3×N), and writing every product's updates
// back in two batched UPDATEs (not 2×N), keeps the round-trip count constant regardless of how many
// distinct products a single document touches.
export async function recostProducts(tx: TxClient, productIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(Array.from(productIds).filter(Boolean))];
  if (ids.length === 0) return;

  const [products, purchaseItems, saleItems, returnItems] = await Promise.all([
    tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, purchasePrice: true } }),
    tx.purchaseBillItem.findMany({
      where: { productId: { in: ids }, purchaseBill: { deletedAt: null, status: { not: "cancelled" } } },
      // purchasePrice is the LIST rate BEFORE the line's own discountPercent is applied (same shape
      // as InvoiceItem.price) — NOT the net per-unit cost actually paid. Using it directly here was
      // a real bug: it overstated cost by the full discount amount on any discounted purchase (e.g.
      // a bill with 60% off costed the product at its pre-discount rate). total/gstAmount already
      // have the discount baked in, so (total - gstAmount) / quantity gives the true net-of-
      // discount, pre-GST unit cost — the same derivation used for custom line items below.
      select: { productId: true, quantity: true, total: true, gstAmount: true, purchaseBill: { select: { billDate: true, createdAt: true } } },
    }),
    tx.invoiceItem.findMany({
      where: { productId: { in: ids }, invoice: { deletedAt: null } },
      select: { id: true, productId: true, quantity: true, invoice: { select: { date: true, createdAt: true } } },
    }),
    tx.returnItem.findMany({
      where: { productId: { in: ids }, return: { deletedAt: null } },
      select: { id: true, productId: true, quantity: true, return: { select: { date: true, createdAt: true } } },
    }),
  ]);

  const fallbackByProduct = new Map(products.map((p) => [p.id, p.purchasePrice ?? 0]));

  type Ev = {
    date: Date; createdAt: Date;
    kindOrder: 0 | 1; // 0 = purchase/return (stock in), 1 = sale (stock out) — same-instant tie-break
    kind: "purchase" | "sale" | "return";
    quantity: number;
    unitCost?: number;
    invoiceItemId?: string;
    returnItemId?: string;
  };
  const eventsByProduct = new Map<string, Ev[]>();
  const pushEvent = (productId: string | null, ev: Ev) => {
    if (!productId) return;
    const list = eventsByProduct.get(productId);
    if (list) list.push(ev); else eventsByProduct.set(productId, [ev]);
  };

  for (const p of purchaseItems) {
    const netUnitCost = p.quantity > 0 ? (p.total - p.gstAmount) / p.quantity : 0;
    pushEvent(p.productId, { date: p.purchaseBill.billDate, createdAt: p.purchaseBill.createdAt, kindOrder: 0, kind: "purchase", quantity: p.quantity, unitCost: netUnitCost });
  }
  for (const r of returnItems) {
    pushEvent(r.productId, { date: r.return.date, createdAt: r.return.createdAt, kindOrder: 0, kind: "return", quantity: r.quantity, returnItemId: r.id });
  }
  for (const s of saleItems) {
    pushEvent(s.productId, { date: s.invoice.date, createdAt: s.invoice.createdAt, kindOrder: 1, kind: "sale", quantity: s.quantity, invoiceItemId: s.id });
  }

  const saleUpdates: { id: string; costPrice: number; costSource: "ledger" | "fallback" }[] = [];
  const returnUpdates: { id: string; costPrice: number; costSource: "ledger" | "fallback" }[] = [];

  for (const productId of ids) {
    const events = eventsByProduct.get(productId);
    if (!events) continue; // no purchase/sale/return history at all for this product
    const fallbackCost = fallbackByProduct.get(productId) ?? 0;

    events.sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime();
      if (byDate !== 0) return byDate;
      if (a.kindOrder !== b.kindOrder) return a.kindOrder - b.kindOrder;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let runningQty = 0;
    let runningValue = 0;
    for (const ev of events) {
      if (ev.kind === "purchase") {
        runningQty += ev.quantity;
        runningValue += ev.quantity * (ev.unitCost ?? 0);
        continue;
      }
      if (ev.kind === "return") {
        const hadStock = runningQty > 0;
        const avgAtReturn = hadStock ? runningValue / runningQty : fallbackCost;
        // Only a ledger-backed return actually adjusts the running pool — a fallback-costed one
        // (no real stock on hand at the time) has no real value to add back, so folding its guessed
        // cost into runningValue would contaminate every later real purchase's weighted average.
        if (hadStock) {
          runningQty += ev.quantity;
          runningValue += ev.quantity * avgAtReturn;
        }
        returnUpdates.push({ id: ev.returnItemId!, costPrice: avgAtReturn, costSource: hadStock ? "ledger" : "fallback" });
        continue;
      }
      // sale
      const hasStock = runningQty > 0;
      const cost = hasStock ? runningValue / runningQty : fallbackCost;
      // Only a ledger-backed sale actually depletes the running pool — a fallback-costed one (sold
      // before any real purchase existed) has no real value/qty to remove, so decrementing anyway
      // would carry its guessed cost forward and skew the very next real purchase's weighted
      // average, even though that average is later labeled "ledger"/verified.
      if (hasStock) {
        runningQty -= ev.quantity;
        runningValue -= ev.quantity * cost;
      }
      saleUpdates.push({ id: ev.invoiceItemId!, costPrice: cost, costSource: hasStock ? "ledger" : "fallback" });
    }
  }

  if (saleUpdates.length > 0) {
    const values = Prisma.join(
      saleUpdates.map((u) => Prisma.sql`(${u.id}::text, ${u.costPrice}::float8, ${u.costSource}::text)`),
      ", ",
    );
    await tx.$executeRaw`
      UPDATE "InvoiceItem" AS ii
      SET "costPrice" = v.cost, "costSource" = v.source
      FROM (VALUES ${values}) AS v(id, cost, source)
      WHERE ii.id = v.id
    `;
  }

  if (returnUpdates.length > 0) {
    const values = Prisma.join(
      returnUpdates.map((u) => Prisma.sql`(${u.id}::text, ${u.costPrice}::float8, ${u.costSource}::text)`),
      ", ",
    );
    await tx.$executeRaw`
      UPDATE "ReturnItem" AS ri
      SET "costPrice" = v.cost, "costSource" = v.source
      FROM (VALUES ${values}) AS v(id, cost, source)
      WHERE ri.id = v.id
    `;
  }
}

// A line item with no productId ("just for this document" custom item, e.g. a one-off product
// name typed directly rather than picked from the catalog) has no purchase-bill history to look
// up at all — recostProducts() above never even sees these rows, since it's keyed by productId.
// Rather than leaving costPrice permanently NULL (silently understating COGS, since the dashboard
// then credits 100% margin to a line that might have cost the business plenty), this assumes a
// deliberately conservative 0%-margin estimate: the line's own NET rate (its total, which is
// already GST-inclusive and net of any discount, minus its own gstAmount, divided by quantity) —
// i.e. "assume this custom item was bought at exactly what it sold for". This can't be derived
// from anything else (no product, no purchase bill), so it's the most honest default available;
// costSource "custom" marks it as an assumption rather than a real (or even fallback) cost, same
// spirit as costSource "fallback" for a catalog product sold before its first purchase bill.
// Idempotent — only touches rows that don't already have a cost (WHERE "costSource" IS NULL /
// "costPrice" IS NULL), so re-running (e.g. the backfill script) never overwrites a real cost.
export async function costCustomLineItems(
  tx: TxClient,
  scope: { invoiceId?: string; returnId?: string } = {},
): Promise<void> {
  if (scope.invoiceId) {
    await tx.$executeRaw`
      UPDATE "InvoiceItem"
      SET "costPrice" = ("total" - "gstAmount") / NULLIF("quantity", 0), "costSource" = 'custom'
      WHERE "invoiceId" = ${scope.invoiceId} AND "productId" IS NULL AND "costSource" IS NULL
    `;
  }
  if (scope.returnId) {
    // A custom return line has no productId — if the original sale had a real user-provided cost
    // (costSource 'custom-provided'), it would otherwise be silently discarded in favor of
    // re-deriving an 0%-margin assumption from the return's OWN price fields. costSource carries
    // the same real-vs-assumed distinction as InvoiceItem's, for the dashboard's Verified Profit.
    // Tier 1 — exact: sourceInvoiceItemId (see schema.prisma) unambiguously identifies the specific
    // InvoiceItem this return reverses, set at return-creation time. No guessing involved.
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "costPrice" = (
        SELECT ii."costPrice" FROM "InvoiceItem" ii
        WHERE ii.id = ri."sourceInvoiceItemId" AND ii."costSource" = 'custom-provided'
      ), "costSource" = 'custom-provided'
      WHERE ri."returnId" = ${scope.returnId} AND ri."productId" IS NULL AND ri."costSource" IS NULL
        AND ri."sourceInvoiceItemId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "InvoiceItem" ii2 WHERE ii2.id = ri."sourceInvoiceItemId" AND ii2."costSource" = 'custom-provided')
    `;
    // Tier 2 — legacy fallback: a return created before sourceInvoiceItemId existed has no exact
    // link, so fall back to matching by name within the same invoice (ambiguous only if that
    // invoice has two custom lines sharing a name — the closest available link otherwise).
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "costPrice" = (
        SELECT ii."costPrice" FROM "InvoiceItem" ii
        JOIN "Return" r ON r."invoiceId" = ii."invoiceId"
        WHERE r.id = ri."returnId" AND ii."productId" IS NULL
          AND ii."name" = ri."name" AND ii."costSource" = 'custom-provided'
        ORDER BY ii.id LIMIT 1
      ), "costSource" = 'custom-provided'
      WHERE ri."returnId" = ${scope.returnId} AND ri."productId" IS NULL AND ri."costSource" IS NULL
        AND EXISTS (
          SELECT 1 FROM "InvoiceItem" ii2
          JOIN "Return" r2 ON r2."invoiceId" = ii2."invoiceId"
          WHERE r2.id = ri."returnId" AND ii2."productId" IS NULL
            AND ii2."name" = ri."name" AND ii2."costSource" = 'custom-provided'
        )
    `;
    // Tier 3 — no real cost found by either link: assume 0% margin from the return's own rate.
    await tx.$executeRaw`
      UPDATE "ReturnItem"
      SET "costPrice" = ("total" - "gstAmount") / NULLIF("quantity", 0), "costSource" = 'custom'
      WHERE "returnId" = ${scope.returnId} AND "productId" IS NULL AND "costSource" IS NULL
    `;
  }
  if (!scope.invoiceId && !scope.returnId) {
    // No scope given — used only by the one-off historical backfill, sweeping every document.
    // One-time upgrade: give an old return row (created before sourceInvoiceItemId existed) that
    // exact link retroactively, but ONLY where the name match is unique within its invoice — an
    // invoice with two custom lines sharing a name stays on the Tier 2 (ambiguous) path below
    // rather than risk silently wiring up the wrong one.
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "sourceInvoiceItemId" = (
        SELECT ii."id" FROM "InvoiceItem" ii
        JOIN "Return" r ON r."invoiceId" = ii."invoiceId"
        WHERE r.id = ri."returnId" AND ii."productId" IS NULL AND ii."name" = ri."name"
      )
      WHERE ri."productId" IS NULL AND ri."sourceInvoiceItemId" IS NULL
        AND (
          SELECT COUNT(*) FROM "InvoiceItem" ii3
          JOIN "Return" r3 ON r3."invoiceId" = ii3."invoiceId"
          WHERE r3.id = ri."returnId" AND ii3."productId" IS NULL AND ii3."name" = ri."name"
        ) = 1
    `;
    await tx.$executeRaw`
      UPDATE "InvoiceItem" ii
      SET "costPrice" = (ii."total" - ii."gstAmount") / NULLIF(ii."quantity", 0), "costSource" = 'custom'
      FROM "Invoice" i
      WHERE ii."invoiceId" = i.id AND i."deletedAt" IS NULL
        AND ii."productId" IS NULL AND ii."costSource" IS NULL
    `;
    // Same 3-tier preference as the scoped branch above: exact sourceInvoiceItemId link first,
    // then legacy name-matching, then the return's own 0%-margin assumption.
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "costPrice" = (
        SELECT ii."costPrice" FROM "InvoiceItem" ii
        WHERE ii.id = ri."sourceInvoiceItemId" AND ii."costSource" = 'custom-provided'
      ), "costSource" = 'custom-provided'
      WHERE ri."productId" IS NULL AND ri."costSource" IS NULL AND ri."sourceInvoiceItemId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "InvoiceItem" ii2 WHERE ii2.id = ri."sourceInvoiceItemId" AND ii2."costSource" = 'custom-provided')
    `;
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "costPrice" = (
        SELECT ii."costPrice" FROM "InvoiceItem" ii
        JOIN "Return" r ON r."invoiceId" = ii."invoiceId"
        WHERE r.id = ri."returnId" AND r."deletedAt" IS NULL AND ii."productId" IS NULL
          AND ii."name" = ri."name" AND ii."costSource" = 'custom-provided'
        ORDER BY ii.id LIMIT 1
      ), "costSource" = 'custom-provided'
      WHERE ri."productId" IS NULL AND ri."costSource" IS NULL
        AND EXISTS (
          SELECT 1 FROM "InvoiceItem" ii2
          JOIN "Return" r2 ON r2."invoiceId" = ii2."invoiceId"
          WHERE r2.id = ri."returnId" AND r2."deletedAt" IS NULL AND ii2."productId" IS NULL
            AND ii2."name" = ri."name" AND ii2."costSource" = 'custom-provided'
        )
    `;
    await tx.$executeRaw`
      UPDATE "ReturnItem" ri
      SET "costPrice" = (ri."total" - ri."gstAmount") / NULLIF(ri."quantity", 0), "costSource" = 'custom'
      FROM "Return" r
      WHERE ri."returnId" = r.id AND r."deletedAt" IS NULL
        AND ri."productId" IS NULL AND ri."costSource" IS NULL
    `;
  }
}
