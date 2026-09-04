// Pure, framework-agnostic state-transition helpers for the notification popover
// (src/components/layout/NotificationBell.tsx) — split out from the component so they're
// unit-testable without pulling in React/next-auth/Prisma. Mirrors the shape returned by
// src/lib/notifications.ts's getNotificationSummary()/getDismissedNotificationSummary(), but
// re-declared here (not imported) since that module also drags in the Prisma client, which a
// "no DB, always run" unit test must not touch.

export type NotificationCategoryKey = "stock" | "overdueInvoices" | "overdueBills" | "overLimitCustomers" | "binExpiring";
export type NotificationSeverity = "critical" | "warning";

// sortKey mirrors the server's own ascending sort for this item's category (stock level, due-date
// timestamp, credit-limit excess, days left in bin) — lets a restored/undone item be reinserted at
// its true position instantly, without waiting on a refetch just to learn where it belongs.
// timestamp is the ISO moment that drives the alert (due date, last stock change, etc.).
export interface NotificationItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: NotificationSeverity;
  sortKey: number;
  timestamp: string;
}
export interface NotificationCategory {
  count: number;
  items: NotificationItem[];
}
export interface NotificationSummary {
  stock: NotificationCategory & { outOfStockCount: number; lowStockCount: number };
  overdueInvoices: NotificationCategory;
  overdueBills: NotificationCategory;
  overLimitCustomers: NotificationCategory;
  binExpiring: NotificationCategory | null;
}

// Removes one item (by id) from whichever category it belongs to, for the instant/optimistic UI
// update on dismiss — the real POST to /api/notifications/dismiss still happens, just in the
// background, so the click doesn't have to wait on a network round trip to feel responsive.
// The count only moves if the item was actually present — otherwise a duplicate call (a duplicate
// touch+click event firing the same handler twice, or two independent code paths removing the
// same item) would silently under-count the badge even though the items array itself stays correct
// (filter() is naturally idempotent).
export function withoutItem(s: NotificationSummary, category: NotificationCategoryKey, item: NotificationItem): NotificationSummary {
  if (category === "stock") {
    const wasPresent = s.stock.items.some((i) => i.id === item.id);
    const dec = wasPresent ? 1 : 0;
    const wasOutOfStock = item.severity === "critical";
    return {
      ...s,
      stock: {
        ...s.stock,
        count: Math.max(0, s.stock.count - dec),
        outOfStockCount: wasOutOfStock ? Math.max(0, s.stock.outOfStockCount - dec) : s.stock.outOfStockCount,
        lowStockCount: wasOutOfStock ? s.stock.lowStockCount : Math.max(0, s.stock.lowStockCount - dec),
        items: s.stock.items.filter((i) => i.id !== item.id),
      },
    };
  }
  if (category === "binExpiring") {
    if (!s.binExpiring) return s;
    const dec = s.binExpiring.items.some((i) => i.id === item.id) ? 1 : 0;
    return { ...s, binExpiring: { count: Math.max(0, s.binExpiring.count - dec), items: s.binExpiring.items.filter((i) => i.id !== item.id) } };
  }
  const cat = s[category];
  const dec = cat.items.some((i) => i.id === item.id) ? 1 : 0;
  return { ...s, [category]: { count: Math.max(0, cat.count - dec), items: cat.items.filter((i) => i.id !== item.id) } };
}

// Undo/restore's counterpart — reinserts the item at the position its sortKey puts it at (same
// ascending order the server sorts that category by), so it lands in its true spot immediately —
// whether it's coming back from a just-clicked Undo or from the separately-loaded "Dismissed"
// panel, neither of which has a cheap way to ask the server "where does this go" without a
// round trip. Same "only move the count if this actually changes membership" rule as withoutItem.
export function withItem(s: NotificationSummary, category: NotificationCategoryKey, item: NotificationItem): NotificationSummary {
  function reinsert(items: NotificationItem[]): NotificationItem[] {
    // Idempotent — a duplicate touch+click event firing the same dismiss/undo/restore handler
    // twice (guarded against separately in the component) must not insert two copies of the same
    // item — nor must publishing a freshly-fetched, already-correct list re-add one still in flight.
    if (items.some((i) => i.id === item.id)) return items;
    const at = items.findIndex((i) => i.sortKey > item.sortKey);
    const insertAt = at === -1 ? items.length : at;
    return [...items.slice(0, insertAt), item, ...items.slice(insertAt)];
  }
  if (category === "stock") {
    const inc = s.stock.items.some((i) => i.id === item.id) ? 0 : 1;
    const wasOutOfStock = item.severity === "critical";
    return {
      ...s,
      stock: {
        ...s.stock,
        count: s.stock.count + inc,
        outOfStockCount: wasOutOfStock ? s.stock.outOfStockCount + inc : s.stock.outOfStockCount,
        lowStockCount: wasOutOfStock ? s.stock.lowStockCount : s.stock.lowStockCount + inc,
        items: reinsert(s.stock.items),
      },
    };
  }
  if (category === "binExpiring") {
    if (!s.binExpiring) return s;
    const inc = s.binExpiring.items.some((i) => i.id === item.id) ? 0 : 1;
    return { ...s, binExpiring: { count: s.binExpiring.count + inc, items: reinsert(s.binExpiring.items) } };
  }
  const cat = s[category];
  const inc = cat.items.some((i) => i.id === item.id) ? 0 : 1;
  return { ...s, [category]: { count: cat.count + inc, items: reinsert(cat.items) } };
}

// Flat-array counterparts of withoutItem/withItem above, for the per-category "Show all" expand
// cache (a bare NotificationItem[] for one category, not a full NotificationSummary).
export function withoutItemFlat(items: NotificationItem[], id: string): NotificationItem[] {
  return items.filter((i) => i.id !== id);
}
export function withItemFlat(items: NotificationItem[], item: NotificationItem): NotificationItem[] {
  if (items.some((i) => i.id === item.id)) return items;
  const at = items.findIndex((i) => i.sortKey > item.sortKey);
  return at === -1 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}
