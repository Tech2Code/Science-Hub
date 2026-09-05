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

// Walks the (already date-filtered, if the caller pre-filtered at the DB layer) entry list once so
// the running balance is always correct. `openingBalanceSeed` carries forward the balance of
// everything before the passed-in entries (computed by the caller, typically via a DB-side
// aggregate — see fetchCustomerLedgerEntries/fetchVendorLedgerEntries below) so a caller doesn't
// have to hand this function the customer/vendor's entire lifetime history just to seed it
// correctly; a caller that still passes full unfiltered history (seed 0) gets the exact same
// result as before, since `from`/`to` here still walk-and-exclude out-of-range entries themselves.
export function buildLedger(entries: LedgerEntry[], from?: Date, to?: Date, openingBalanceSeed = 0): LedgerResult {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = openingBalanceSeed;
  let openingBalance = openingBalanceSeed;
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

export interface LedgerEntriesResult {
  entries: LedgerEntry[];
  // The balance of everything strictly before `from` — 0 (and cheap: no aggregate query at all)
  // when no `from` was given, since there's then nothing to seed. Pass straight through to
  // buildLedger's own `openingBalanceSeed` param.
  openingBalanceSeed: number;
}

function rangeWhere(from?: Date, to?: Date) {
  return (from || to) ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;
}

// Only pulls the customer's FULL lifetime history when no `from` is given (the "view everything"
// case) — once a caller narrows to a date range, only rows inside it are fetched in full, and
// everything older is collapsed into `openingBalanceSeed` via three lightweight SUM aggregates
// instead of every historical invoice/payment/credit-note row.
export async function fetchCustomerLedgerEntries(customerId: string, from?: Date, to?: Date): Promise<LedgerEntriesResult> {
  const dateFilter = rangeWhere(from, to);
  const [invoices, payments, returns] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId, deletedAt: null, ...(dateFilter && { date: dateFilter }) },
      select: { id: true, invoiceNumber: true, date: true, total: true },
    }),
    prisma.payment.findMany({
      where: { invoice: { customerId, deletedAt: null }, ...(dateFilter && { date: dateFilter }) },
      select: { id: true, amount: true, date: true, method: true, invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.return.findMany({
      where: { invoice: { customerId, deletedAt: null }, deletedAt: null, ...(dateFilter && { date: dateFilter }) },
      select: { id: true, total: true, date: true, creditNoteNumber: true, invoice: { select: { invoiceNumber: true } } },
    }),
  ]);

  let openingBalanceSeed = 0;
  if (from) {
    const [invBefore, payBefore, retBefore] = await Promise.all([
      prisma.invoice.aggregate({ where: { customerId, deletedAt: null, date: { lt: from } }, _sum: { total: true } }),
      prisma.payment.aggregate({ where: { invoice: { customerId, deletedAt: null }, date: { lt: from } }, _sum: { amount: true } }),
      prisma.return.aggregate({ where: { invoice: { customerId, deletedAt: null }, deletedAt: null, date: { lt: from } }, _sum: { total: true } }),
    ]);
    openingBalanceSeed = (invBefore._sum.total ?? 0) - (payBefore._sum.amount ?? 0) - (retBefore._sum.total ?? 0);
  }

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
  return { entries, openingBalanceSeed };
}

// Same pushdown strategy as fetchCustomerLedgerEntries — see there for the reasoning.
export async function fetchVendorLedgerEntries(vendorId: string, from?: Date, to?: Date): Promise<LedgerEntriesResult> {
  const dateFilter = rangeWhere(from, to);
  const [bills, payments] = await Promise.all([
    prisma.purchaseBill.findMany({
      where: { vendorId, deletedAt: null, status: { not: "cancelled" }, ...(dateFilter && { billDate: dateFilter }) },
      select: { id: true, billNumber: true, billDate: true, total: true },
    }),
    prisma.purchasePayment.findMany({
      where: { purchaseBill: { vendorId, deletedAt: null, status: { not: "cancelled" } }, ...(dateFilter && { date: dateFilter }) },
      select: { id: true, amount: true, date: true, method: true, purchaseBill: { select: { billNumber: true } } },
    }),
  ]);

  let openingBalanceSeed = 0;
  if (from) {
    const [billBefore, payBefore] = await Promise.all([
      prisma.purchaseBill.aggregate({ where: { vendorId, deletedAt: null, status: { not: "cancelled" }, billDate: { lt: from } }, _sum: { total: true } }),
      prisma.purchasePayment.aggregate({ where: { purchaseBill: { vendorId, deletedAt: null, status: { not: "cancelled" } }, date: { lt: from } }, _sum: { amount: true } }),
    ]);
    openingBalanceSeed = (billBefore._sum.total ?? 0) - (payBefore._sum.amount ?? 0);
  }

  const entries: LedgerEntry[] = [];
  for (const b of bills) {
    entries.push({ date: b.billDate, type: "purchase_bill", label: `Bill ${b.billNumber}`, refId: b.id, debit: 0, credit: b.total });
  }
  for (const p of payments) {
    entries.push({ date: p.date, type: "purchase_payment", label: `Payment made (${p.method}) — ${p.purchaseBill.billNumber}`, refId: p.id, debit: p.amount, credit: 0 });
  }
  return { entries, openingBalanceSeed };
}
