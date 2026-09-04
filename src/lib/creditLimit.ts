import { prisma } from "@/lib/prisma";

export interface CreditLimitCheck {
  exceeded: boolean;
  creditLimit: number;
  currentOutstanding: number;
  projectedOutstanding: number;
}

// Returns null when the customer has no creditLimit configured (no enforcement). Otherwise sums the
// customer's outstanding balance (Invoice.balanceDue, a real Postgres generated column) across every
// OTHER active invoice, then adds `newInvoiceBalance` (the invoice being created/edited, computed by
// the caller as total − paidAmount so it's dimensionally the same as balanceDue) to project the
// resulting outstanding total.
export async function checkCustomerCreditLimit(
  customerId: string,
  newInvoiceBalance: number,
  excludeInvoiceId?: string
): Promise<CreditLimitCheck | null> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { creditLimit: true } });
  if (!customer || customer.creditLimit == null) return null;

  const agg = await prisma.invoice.aggregate({
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
