import { prisma } from "@/lib/prisma";

// A statement ("account ledger") is a chronological Debit/Credit list with a running balance —
// shared shape for both the Customer statement (Invoice=debit, Payment/CreditNote=credit, positive
// balance = customer owes us) and the Vendor statement (PurchaseBill=credit, PurchasePayment=debit,
// positive balance = we owe the vendor).
export type LedgerEntryType = "invoice" | "payment" | "credit_note" | "purchase_bill" | "purchase_payment";

export interface LedgerEntry {
  date: Date;
  type: LedgerEntryType;
  label: string;
  refId: string;
  debit: number;
  credit: number;
}

export interface LedgerRow {
  date: string;
  type: LedgerEntryType;
  label: string;
  refId: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerResult {
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: LedgerRow[];
}

// Sorts the FULL entry history and walks it once so the running balance (and the opening balance
// for a filtered range) is always correct even when the caller only wants to display a sub-range —
// a statement's balance is never right if computed from a partial slice of history.
export function buildLedger(entries: LedgerEntry[], from?: Date, to?: Date): LedgerResult {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  let openingBalance = 0;
  const rows: LedgerRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const e of sorted) {
    running += e.debit - e.credit;
    const beforeFrom = from && e.date.getTime() < from.getTime();
    const afterTo = to && e.date.getTime() > to.getTime();
    if (beforeFrom) {
      openingBalance = running;
      continue;
    }
    if (afterTo) continue;
    totalDebit += e.debit;
    totalCredit += e.credit;
    rows.push({
      date: e.date.toISOString(),
      type: e.type,
      label: e.label,
      refId: e.refId,
      debit: e.debit,
      credit: e.credit,
      balance: running,
    });
  }

  return {
    openingBalance,
    closingBalance: rows.length ? rows[rows.length - 1].balance : openingBalance,
    totalDebit,
    totalCredit,
    rows,
  };
}

export async function fetchCustomerLedgerEntries(customerId: string): Promise<LedgerEntry[]> {
  const invoices = await prisma.invoice.findMany({
    where: { customerId, deletedAt: null },
    select: { id: true, invoiceNumber: true, date: true, total: true },
  });
  const payments = await prisma.payment.findMany({
    where: { invoice: { customerId, deletedAt: null } },
    select: { id: true, amount: true, date: true, method: true, invoice: { select: { invoiceNumber: true } } },
  });
  const returns = await prisma.return.findMany({
    where: { invoice: { customerId, deletedAt: null }, deletedAt: null },
    select: { id: true, total: true, date: true, creditNoteNumber: true, invoice: { select: { invoiceNumber: true } } },
  });

  const entries: LedgerEntry[] = [];
  for (const inv of invoices) {
    entries.push({ date: inv.date, type: "invoice", label: `Invoice ${inv.invoiceNumber}`, refId: inv.id, debit: inv.total, credit: 0 });
  }
  for (const p of payments) {
    entries.push({ date: p.date, type: "payment", label: `Payment received (${p.method}) — ${p.invoice.invoiceNumber}`, refId: p.id, debit: 0, credit: p.amount });
  }
  for (const r of returns) {
    entries.push({ date: r.date, type: "credit_note", label: `Credit Note ${r.creditNoteNumber ?? ""} — ${r.invoice.invoiceNumber}`, refId: r.id, debit: 0, credit: r.total });
  }
  return entries;
}

export async function fetchVendorLedgerEntries(vendorId: string): Promise<LedgerEntry[]> {
  const bills = await prisma.purchaseBill.findMany({
    where: { vendorId, deletedAt: null, status: { not: "cancelled" } },
    select: { id: true, billNumber: true, billDate: true, total: true },
  });
  const payments = await prisma.purchasePayment.findMany({
    where: { purchaseBill: { vendorId, deletedAt: null, status: { not: "cancelled" } } },
    select: { id: true, amount: true, date: true, method: true, purchaseBill: { select: { billNumber: true } } },
  });

  const entries: LedgerEntry[] = [];
  for (const b of bills) {
    entries.push({ date: b.billDate, type: "purchase_bill", label: `Bill ${b.billNumber}`, refId: b.id, debit: 0, credit: b.total });
  }
  for (const p of payments) {
    entries.push({ date: p.date, type: "purchase_payment", label: `Payment made (${p.method}) — ${p.purchaseBill.billNumber}`, refId: p.id, debit: p.amount, credit: 0 });
  }
  return entries;
}
