import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export class InvoiceQuantityValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "InvoiceQuantityValidationError";
  }
}

export interface InvoiceLineForValidation {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
}

// An invoice's line-item quantity can never be edited below what's already
// been returned against it — otherwise stock/ledger/accounting would be
// reconciled against units that no longer exist on the invoice. Removing a
// line item entirely counts as reducing its quantity to 0.
//
// Call this as the first step inside the same transaction that performs the
// update, before any stock/ledger/accounting mutation — throwing here aborts
// the transaction and leaves the invoice, stock, and returns untouched.
export async function assertInvoiceQuantitiesNotBelowReturned(
  tx: TxClient,
  invoiceId: string,
  editedItems: InvoiceLineForValidation[]
): Promise<void> {
  const returnItems = await tx.returnItem.findMany({
    where: { return: { invoiceId } },
    select: { productId: true, quantity: true, name: true },
  });
  if (returnItems.length === 0) return;

  const returnedByProduct = new Map<string, { quantity: number; name: string }>();
  for (const ri of returnItems) {
    if (!ri.productId) continue;
    const existing = returnedByProduct.get(ri.productId);
    returnedByProduct.set(ri.productId, {
      quantity: (existing?.quantity ?? 0) + ri.quantity,
      name: existing?.name ?? ri.name,
    });
  }
  if (returnedByProduct.size === 0) return;

  const editedByProduct = new Map(
    editedItems
      .filter((item): item is InvoiceLineForValidation & { productId: string } => !!item.productId)
      .map((item) => [item.productId, item])
  );

  const errors: string[] = [];
  for (const [productId, returned] of returnedByProduct) {
    const edited = editedByProduct.get(productId);
    const editedQty = edited?.quantity ?? 0;
    if (editedQty < returned.quantity) {
      const name = edited?.name ?? returned.name;
      const unit = edited?.unit ?? "unit(s)";
      errors.push(
        `Cannot update invoice. The quantity for '${name}' cannot be reduced to ${editedQty} ${unit} because ${returned.quantity} ${unit} has already been returned. Please edit or delete the return entry before reducing the invoice quantity.`
      );
    }
  }

  if (errors.length > 0) throw new InvoiceQuantityValidationError(errors);
}
