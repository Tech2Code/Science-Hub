import { describe, it, expect } from "vitest";
import { buildLedger, type LedgerEntry } from "@/lib/statementQuery";

const d = (s: string) => new Date(s);

function entry(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "date">): LedgerEntry {
  return { type: "invoice", label: "x", refId: "id", debit: 0, credit: 0, ...overrides };
}

describe("buildLedger", () => {
  it("sorts out-of-order entries and keeps the running balance monotonic per date", () => {
    const entries: LedgerEntry[] = [
      entry({ date: d("2026-01-10"), type: "invoice", refId: "inv-2", debit: 500, credit: 0 }),
      entry({ date: d("2026-01-01"), type: "invoice", refId: "inv-1", debit: 1000, credit: 0 }),
      entry({ date: d("2026-01-05"), type: "payment", refId: "pay-1", debit: 0, credit: 300 }),
    ];
    const result = buildLedger(entries);
    expect(result.rows.map((r) => r.refId)).toEqual(["inv-1", "pay-1", "inv-2"]);
    expect(result.rows.map((r) => r.balance)).toEqual([1000, 700, 1200]);
    expect(result.closingBalance).toBe(1200);
    expect(result.totalDebit).toBe(1500);
    expect(result.totalCredit).toBe(300);
  });

  it("folds an entry before `from` into openingBalance and excludes it from rows/totals", () => {
    const entries: LedgerEntry[] = [
      entry({ date: d("2025-12-01"), type: "invoice", refId: "old-invoice", debit: 1000, credit: 0 }),
      entry({ date: d("2026-01-15"), type: "payment", refId: "in-range-payment", debit: 0, credit: 200 }),
    ];
    const result = buildLedger(entries, d("2026-01-01"));
    expect(result.openingBalance).toBe(1000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].refId).toBe("in-range-payment");
    expect(result.totalDebit).toBe(0);
    expect(result.totalCredit).toBe(200);
    expect(result.closingBalance).toBe(800);
  });

  it("excludes an entry after `to` entirely (not even counted toward closingBalance)", () => {
    const entries: LedgerEntry[] = [
      entry({ date: d("2026-01-05"), type: "invoice", refId: "in-range", debit: 500, credit: 0 }),
      entry({ date: d("2026-02-01"), type: "invoice", refId: "future-invoice", debit: 900, credit: 0 }),
    ];
    const result = buildLedger(entries, undefined, d("2026-01-31"));
    expect(result.rows.map((r) => r.refId)).toEqual(["in-range"]);
    expect(result.closingBalance).toBe(500);
  });

  it("returns an all-zero result for an empty entry list without throwing", () => {
    const result = buildLedger([]);
    expect(result).toEqual({ openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0, rows: [] });
  });

  it("seeds the running balance from openingBalanceSeed when the caller pre-filtered at the DB layer", () => {
    // Simulates the performance-optimized path: the caller already excluded everything before
    // `from` at the database layer and passed the pre-computed opening balance as a seed instead.
    const entries: LedgerEntry[] = [
      entry({ date: d("2026-01-15"), type: "payment", refId: "p1", debit: 0, credit: 200 }),
    ];
    const result = buildLedger(entries, d("2026-01-01"), undefined, 1000);
    expect(result.openingBalance).toBe(1000);
    expect(result.rows).toHaveLength(1);
    expect(result.closingBalance).toBe(800);
  });

  it("applies the vendor-direction sign convention correctly (bill=credit, payment=debit)", () => {
    const entries: LedgerEntry[] = [
      entry({ date: d("2026-01-01"), type: "purchase_bill", refId: "bill-1", debit: 0, credit: 1000 }),
      entry({ date: d("2026-01-10"), type: "purchase_payment", refId: "pay-1", debit: 400, credit: 0 }),
    ];
    const result = buildLedger(entries);
    // running = debit - credit for each entry, per fetchVendorLedgerEntries' own sign mapping
    // (bill=credit, payment=debit) — a more negative balance means more still owed to the vendor.
    expect(result.rows.map((r) => r.balance)).toEqual([-1000, -600]);
    expect(result.closingBalance).toBe(-600);
  });
});

describe("buildLedger — same IST day ordering", () => {
  it("puts a same-day invoice before its payment so the running balance never dips negative", () => {
    // Payment stored at IST midnight (18:30Z the previous UTC day); invoice created at 15:00 IST the same day.
    const entries: LedgerEntry[] = [
      entry({ date: new Date("2026-03-09T18:30:00Z"), type: "payment", refId: "pay", debit: 0, credit: 1000 }),
      entry({ date: new Date("2026-03-10T09:30:00Z"), type: "invoice", refId: "inv", debit: 1000, credit: 0 }),
    ];
    const result = buildLedger(entries);
    expect(result.rows.map((r) => r.refId)).toEqual(["inv", "pay"]);
    expect(result.rows.every((r) => r.balance >= 0)).toBe(true);
    expect(result.closingBalance).toBe(0);
  });

  it("orders a vendor's same-day bill before its payment too", () => {
    const entries: LedgerEntry[] = [
      entry({ date: new Date("2026-03-09T18:30:00Z"), type: "purchase_payment", refId: "pp", debit: 500, credit: 0 }),
      entry({ date: new Date("2026-03-10T09:30:00Z"), type: "purchase_bill", refId: "pb", debit: 0, credit: 500 }),
    ];
    expect(buildLedger(entries).rows.map((r) => r.refId)).toEqual(["pb", "pp"]);
  });

  it("still orders entries on different IST days strictly by date", () => {
    const entries: LedgerEntry[] = [
      entry({ date: new Date("2026-03-11T00:00:00Z"), type: "invoice", refId: "later-inv", debit: 100, credit: 0 }),
      entry({ date: new Date("2026-03-10T09:30:00Z"), type: "payment", refId: "earlier-pay", debit: 0, credit: 50 }),
    ];
    expect(buildLedger(entries).rows.map((r) => r.refId)).toEqual(["earlier-pay", "later-inv"]);
  });
});
