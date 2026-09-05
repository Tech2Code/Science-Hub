import type { Prisma, PrismaClient } from "@prisma/client";

export interface CreditLimitCheck {
  exceeded: boolean;
  creditLimit: number;
  currentOutstanding: number;
  projectedOutstanding: number;
}

// Runs against whatever Prisma client the caller passes — the plain singleton for a read-only
// pre-check, or a transaction's `tx` when the check must be re-validated atomically alongside the
// invoice insert/update itself (see invoices/route.ts and invoices/[id]/route.ts): checking outside
// any transaction lets two concurrent requests for the same customer each read the same
// outstanding balance, both pass, and jointly breach the limit with neither ever seeing the other's
// invoice — running the check inside the same Serializable transaction as the write closes that gap.
type DbClient = PrismaClient | Prisma.TransactionClient;

// Returns null when the customer has no creditLimit configured (no enforcement). Otherwise sums the
// customer's outstanding balance (Invoice.balanceDue, a real Postgres generated column) across every
// OTHER active invoice, then adds `newInvoiceBalance` (the invoice being created/edited, computed by
// the caller as total − paidAmount so it's dimensionally the same as balanceDue) to project the
// resulting outstanding total.
export async function checkCustomerCreditLimit(
  db: DbClient,
  customerId: string,
  newInvoiceBalance: number,
  excludeInvoiceId?: string
): Promise<CreditLimitCheck | null> {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { creditLimit: true } });
  if (!customer || customer.creditLimit == null) return null;

  const agg = await db.invoice.aggregate({
    where: { customerId, deletedAt: null, ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}) },
    _sum: { balanceDue: true },
  });
  const currentOutstanding = agg._sum.balanceDue ?? 0;
  const projectedOutstanding = currentOutstanding + newInvoiceBalance;

  return {
    exceeded: projectedOutstanding > customer.creditLimit,
    creditLimit: customer.creditLimit,
    currentOutstanding,
    projectedOutstanding,
  };
}
