import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// Specific movement types (no generic "adjustment") so the ledger reads as an audit trail of which action produced each row.
export type StockMovementType =
  | "sale" | "sale_edit_reverse" | "sale_edit_apply" | "sale_delete_restore" | "sale_bin_restore"
  | "purchase" | "purchase_edit_reverse" | "purchase_edit_apply" | "purchase_cancel" | "purchase_uncancel" | "purchase_delete_restore" | "purchase_bin_restore"
  | "return" | "return_delete_reverse" | "return_bin_restore"
  | "manual";

export type StockMovementDocumentType = "invoice" | "purchase_bill" | "credit_note" | "manual";

export const DOCUMENT_TYPE_BY_MOVEMENT_TYPE: Record<StockMovementType, StockMovementDocumentType> = {
  sale: "invoice", sale_edit_reverse: "invoice", sale_edit_apply: "invoice", sale_delete_restore: "invoice", sale_bin_restore: "invoice",
  purchase: "purchase_bill", purchase_edit_reverse: "purchase_bill", purchase_edit_apply: "purchase_bill", purchase_cancel: "purchase_bill", purchase_uncancel: "purchase_bill", purchase_delete_restore: "purchase_bill", purchase_bin_restore: "purchase_bill",
  return: "credit_note", return_delete_reverse: "credit_note", return_bin_restore: "credit_note",
  manual: "manual",
};

interface RecordStockMovementInput {
  productId: string;
  type: StockMovementType;
  quantity: number; // signed: positive = stock in, negative = stock out
  balanceAfter: number;
  reference?: string;
  notes?: string;
  purchaseBillId?: string;
  createdByUserId?: string;
  // Pass when already known (e.g. from an update() just run) to skip an extra query — matters in per-line-item loops against the pooled single-connection Neon DB.
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
      documentType: DOCUMENT_TYPE_BY_MOVEMENT_TYPE[input.type],
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
  type: StockMovementType;
  reference?: string;
  notes?: string;
  purchaseBillId?: string;
  createdByUserId?: string;
}

// Applies stock deltas for many products in one round trip (UPDATE...RETURNING + createMany) instead of per-item queries, which pushed large
// invoices/bills past the transaction timeout against the pooled single-connection Neon DB.
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

  // Raw UPDATE...WHERE silently skips a missing productId (unlike product.update()'s P2025) — this check catches a stale/deleted reference instead of silently dropping it.
  if (updated.length !== entries.length) {
    const foundIds = new Set(updated.map((p) => p.id));
    throw new ProductNotFoundError(entries.filter(([id]) => !foundIds.has(id)).map(([id]) => id));
  }

  await tx.stockMovement.createMany({
    data: updated.map((p) => ({
      productId: p.id,
      productName: p.name,
      type: movement.type,
      documentType: DOCUMENT_TYPE_BY_MOVEMENT_TYPE[movement.type],
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
