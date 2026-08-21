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

// A line item's quantity can never be edited below what's already returned against it (removal counts as reducing to 0).
// Call first inside the update transaction — throwing here aborts before any stock/ledger mutation.
export async function assertInvoiceQuantitiesNotBelowReturned(
  tx: TxClient,
  invoiceId: string,
  editedItems: InvoiceLineForValidation[]
): Promise<void> {
  const returnItems = await tx.returnItem.findMany({
    where: { return: { invoiceId, deletedAt: null } },
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

  // Sum across lines rather than keying the last one — the same product can appear on two separate line items.
  const editedByProduct = new Map<string, InvoiceLineForValidation & { productId: string }>();
  for (const item of editedItems) {
    if (!item.productId) continue;
    const existing = editedByProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      editedByProduct.set(item.productId, { ...item, productId: item.productId });
    }
  }

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
