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
}

export function recordStockMovement(tx: TxClient, input: RecordStockMovementInput) {
  return tx.stockMovement.create({
    data: {
      productId: input.productId,
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
