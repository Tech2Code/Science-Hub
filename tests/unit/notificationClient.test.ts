import { describe, it, expect } from "vitest";
import {
  withoutItem, withItem, withoutItemFlat, withItemFlat,
  type NotificationItem, type NotificationSummary,
} from "@/lib/notificationClient";

function item(id: string, sortKey: number, overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    label: id,
    detail: "",
    href: "/",
    severity: "warning",
    sortKey,
    timestamp: new Date(0).toISOString(),
    ...overrides,
  };
}

function emptySummary(binExpiring: NotificationSummary["binExpiring"] = { count: 0, items: [] }): NotificationSummary {
  return {
    stock: { count: 0, outOfStockCount: 0, lowStockCount: 0, items: [] },
    overdueInvoices: { count: 0, items: [] },
    overdueBills: { count: 0, items: [] },
    overLimitCustomers: { count: 0, items: [] },
    binExpiring,
  };
}

describe("withItem / withoutItem (full NotificationSummary)", () => {
  it("withItem inserts at the position its sortKey puts it (ascending)", () => {
    const s = emptySummary();
    s.overdueInvoices = { count: 2, items: [item("a", 1), item("c", 3)] };
    const next = withItem(s, "overdueInvoices", item("b", 2));
    expect(next.overdueInvoices.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next.overdueInvoices.count).toBe(3);
  });

  it("withItem appends when sortKey is larger than every existing item", () => {
    const s = emptySummary();
    s.overdueBills = { count: 1, items: [item("a", 1)] };
    const next = withItem(s, "overdueBills", item("z", 99));
    expect(next.overdueBills.items.map((i) => i.id)).toEqual(["a", "z"]);
  });

  it("withItem is idempotent — inserting an id already present is a no-op (guards against a duplicate touch+click firing the handler twice, or a stale refetch racing an optimistic patch)", () => {
    const s = emptySummary();
    s.overdueInvoices = { count: 1, items: [item("a", 1)] };
    const next = withItem(s, "overdueInvoices", item("a", 1));
    expect(next.overdueInvoices.items.map((i) => i.id)).toEqual(["a"]);
    expect(next.overdueInvoices.count).toBe(1); // count must not double-increment either
  });

  it("withoutItem removes by id and decrements count, clamped at 0", () => {
    const s = emptySummary();
    s.overdueBills = { count: 1, items: [item("a", 1)] };
    const next = withoutItem(s, "overdueBills", item("a", 1));
    expect(next.overdueBills.items).toEqual([]);
    expect(next.overdueBills.count).toBe(0);
    // removing again (already absent) must not go negative
    const again = withoutItem(next, "overdueBills", item("a", 1));
    expect(again.overdueBills.count).toBe(0);
  });

  it("withoutItem only decrements count when the item was actually present — a duplicate/stale call for an id that's already gone must not silently under-count a still-accurate, non-zero total", () => {
    const s = emptySummary();
    s.overdueBills = { count: 3, items: [item("a", 1), item("b", 2)] }; // count 3 legitimately exceeds items.length (only top 5 shown)
    const next = withoutItem(s, "overdueBills", item("zzz-not-in-list", 5));
    expect(next.overdueBills.count).toBe(3); // unrelated id — nothing actually removed, count must be untouched
    expect(next.overdueBills.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("stock category keeps outOfStockCount/lowStockCount in sync with severity", () => {
    let s = emptySummary();
    s.stock = { count: 0, outOfStockCount: 0, lowStockCount: 0, items: [] };
    s = withItem(s, "stock", item("out1", 0, { severity: "critical" }));
    s = withItem(s, "stock", item("low1", 5, { severity: "warning" }));
    expect(s.stock.count).toBe(2);
    expect(s.stock.outOfStockCount).toBe(1);
    expect(s.stock.lowStockCount).toBe(1);

    s = withoutItem(s, "stock", item("out1", 0, { severity: "critical" }));
    expect(s.stock.count).toBe(1);
    expect(s.stock.outOfStockCount).toBe(0);
    expect(s.stock.lowStockCount).toBe(1);
  });

  it("binExpiring null (manager with no Bin access) is left untouched by both helpers", () => {
    const s = emptySummary(null);
    expect(withItem(s, "binExpiring", item("x", 1)).binExpiring).toBeNull();
    expect(withoutItem(s, "binExpiring", item("x", 1)).binExpiring).toBeNull();
  });
});

describe("withItemFlat / withoutItemFlat (per-category 'Show all' expand cache)", () => {
  it("inserts at the sortKey-ordered position", () => {
    const items = [item("a", 1), item("c", 3)];
    const next = withItemFlat(items, item("b", 2));
    expect(next.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("is idempotent — same id already present is a no-op", () => {
    const items = [item("a", 1)];
    const next = withItemFlat(items, item("a", 1));
    expect(next).toHaveLength(1);
    expect(next).toBe(items); // returns the same reference, not a new array, when it's a no-op
  });

  it("withoutItemFlat filters by id", () => {
    const items = [item("a", 1), item("b", 2)];
    expect(withoutItemFlat(items, "a").map((i) => i.id)).toEqual(["b"]);
    // removing an id that isn't there is a harmless no-op
    expect(withoutItemFlat(items, "zzz").map((i) => i.id)).toEqual(["a", "b"]);
  });
});
