import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

interface RecordStockMovementInput {
  productId: string;
  type: "purchase" | "sale" | "adjustment" | "return";
  quantity: number; // signed: positive = stock in, negative = stock out
  balanceAfter: number;
  reference?: string;
  notes?: string;
  purchaseBillId?: string;
  createdByUserId?: string;
  // Pass this whenever the caller already has the product name in hand (e.g.
  // from the update()/create() it just ran) — skips an extra round-trip
  // query per call, which matters a lot in per-line-item loops against a
  // pooled single-connection Neon database (connection_limit=1 in prod),
  // where each extra query serializes and can push a multi-item transaction
  // past its timeout.
  productName?: string;
}

export async function recordStockMovement(tx: TxClient, input: RecordStockMovementInput) {
  const productName = input.productName ??
    (await tx.product.findUnique({ where: { id: input.productId }, select: { name: true } }))?.name ?? "";
  return tx.stockMovement.create({
    data: {
      productId: input.productId,
      productName,
      type: input.type,
      quantity: input.quantity,
      balanceAfter: input.balanceAfter,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      purchaseBillId: input.purchaseBillId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export class ProductNotFoundError extends Error {
  constructor(public readonly productIds: string[]) {
    super(`One or more products no longer exist (they may have been deleted) — remove the affected line item(s) and re-add them from the current product list.`);
    this.name = "ProductNotFoundError";
  }
}

interface StockDelta {
  productId: string;
  quantity: number; // signed delta to apply to stock
}

interface BatchStockMovementInput {
  type: "purchase" | "sale" | "adjustment" | "return";
  reference?: string;
  notes?: string;
  purchaseBillId?: string;
  createdByUserId?: string;
}

// Applies signed stock deltas for many products in a single round trip (one
// UPDATE ... RETURNING plus one createMany) instead of one product.update() +
// one stockMovement.create() per line item. A per-item loop is what pushed
// large invoices/purchase bills past the transaction timeout against a pooled
// single-connection Neon database (connection_limit=1 in prod) — every extra
// round trip there serializes instead of overlapping.
export async function batchAdjustStock(
  tx: TxClient,
  deltas: StockDelta[],
  movement: BatchStockMovementInput
): Promise<{ id: string; name: string; stock: number }[]> {
  if (deltas.length === 0) return [];

  // Aggregate first — the same product can appear on multiple line items,
  // and a single VALUES row per product id is required for the join below.
  const deltaByProduct = new Map<string, number>();
  for (const d of deltas) {
    deltaByProduct.set(d.productId, (deltaByProduct.get(d.productId) ?? 0) + d.quantity);
  }
  const entries = [...deltaByProduct.entries()];

  const values = Prisma.join(
    entries.map(([productId, delta]) => Prisma.sql`(${productId}::text, ${delta}::integer)`),
    ", "
  );

  const updated = await tx.$queryRaw<{ id: string; name: string; stock: number }[]>`
    UPDATE "Product" AS p
    SET stock = p.stock + v.delta
    FROM (VALUES ${values}) AS v(id, delta)
    WHERE p.id = v.id
    RETURNING p.id, p.name, p.stock
  `;

  // The raw UPDATE...WHERE silently skips a productId with no matching row
  // instead of throwing the way product.update() used to (P2025) — without
  // this check a stale/deleted product reference would silently drop its
  // stock adjustment and ledger entry instead of failing the transaction.
  if (updated.length !== entries.length) {
    const foundIds = new Set(updated.map((p) => p.id));
    throw new ProductNotFoundError(entries.filter(([id]) => !foundIds.has(id)).map(([id]) => id));
  }

  await tx.stockMovement.createMany({
    data: updated.map((p) => ({
      productId: p.id,
      productName: p.name,
      type: movement.type,
      quantity: deltaByProduct.get(p.id)!,
      balanceAfter: p.stock,
      reference: movement.reference ?? null,
      notes: movement.notes ?? null,
      purchaseBillId: movement.purchaseBillId ?? null,
      createdByUserId: movement.createdByUserId ?? null,
    })),
  });

  return updated;
}
