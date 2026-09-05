import { prisma } from "@/lib/prisma";

// Capped per category — this powers a topbar "glance" dropdown, not a paginated list; each
// category links through to its real list page (with existing filters) for the full picture.
const ITEM_LIMIT = 5;

// A dismissal hides an item for this long, then it resurfaces if still true — an unresolved
// overdue invoice (say) must not be silently hidden forever just because someone dismissed it once.
export const DISMISSAL_TTL_MS = 24 * 60 * 60 * 1000;

export type NotificationCategoryKey = "stock" | "overdueInvoices" | "overdueBills" | "overLimitCustomers" | "binExpiring";
export const NOTIFICATION_CATEGORY_KEYS: NotificationCategoryKey[] = ["stock", "overdueInvoices", "overdueBills", "overLimitCustomers", "binExpiring"];

export type NotificationSeverity = "critical" | "warning";

export interface NotificationItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: NotificationSeverity;
  // Same ascending order this item was sorted by server-side (stock level, due-date timestamp,
  // credit-limit excess, days left in bin — whichever applies to its category). Lets the client
  // insert a restored/undone item back at its correct position instantly, without waiting on a
  // refetch just to learn where it belongs.
  sortKey: number;
  // ISO timestamp of the date/time driving this alert (due date, last stock change, latest
  // invoice activity, or when it was moved to the bin) — shown on the item so "how recent is
  // this" doesn't require opening it. Not always the same field sortKey is derived from in sign,
  // but always the same underlying moment.
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
  binExpiring: NotificationCategory | null; // null when the caller can't access the Bin (managers)
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same threshold/severity rule for both overdue invoices and overdue bills — more than a week
// late is treated as critical (money genuinely at risk of going unpaid), a fresher miss as a
// warning. Hoisted once here rather than redefined per exported function.
function daysOverdue(dueDate: Date, now: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
}
function overdueSeverity(days: number): NotificationSeverity {
  return days > 7 ? "critical" : "warning";
}

const BIN_PURGE_DAYS = 30;
const BIN_SOON_THRESHOLD_DAYS = 7; // items with this many days or fewer left before auto-purge surface as "expiring soon"

// A generous cap, not a hard business limit — bounds the worst case (a business with credit
// limits set on most/all of its customers) without affecting any realistically-sized dataset.
// The correct long-term fix is pushing the over-limit comparison itself into SQL; this cap is
// the pragmatic interim guard the audit called for.
const OVER_LIMIT_CUSTOMER_FETCH_CAP = 1000;

type IdFilter = { in: string[] } | { notIn: string[] };

// A dismissal row is only ever meaningfully queried within the last DISMISSAL_TTL_MS (24h) — past
// that, nothing in this file ever selects it again, but nothing deleted it either, so the table
// would otherwise grow one row per user per dismissed item forever. Purged opportunistically here
// (mirrors the Bin's own auto-purge-on-read pattern) rather than needing a separate cron route;
// keeps a week of slack past the TTL purely so a slightly-clock-skewed request never races a
// legitimate still-active row out from under itself.
const DISMISSAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
async function purgeExpiredDismissals(): Promise<void> {
  await prisma.notificationDismissal.deleteMany({
    where: { dismissedAt: { lt: new Date(Date.now() - DISMISSAL_RETENTION_MS) } },
  });
}

// One query for however many categories a caller needs (previously 5 separate near-identical
// queries run in parallel through the app's single pooled DB connection, so they queued rather
// than actually running concurrently) — grouped into a per-category Set of still-active
// (non-expired) dismissal ids.
async function getActiveDismissalMap(userId: string, categories: NotificationCategoryKey[]): Promise<Map<NotificationCategoryKey, Set<string>>> {
  const map = new Map<NotificationCategoryKey, Set<string>>();
  for (const cat of categories) map.set(cat, new Set());
  if (categories.length === 0) return map;

  // Fire-and-forget — never let a slow/failed purge delay or break the actual read.
  purgeExpiredDismissals().catch((err) => console.error("purgeExpiredDismissals error:", err));

  const rows = await prisma.notificationDismissal.findMany({
    where: { userId, category: { in: categories }, dismissedAt: { gte: new Date(Date.now() - DISMISSAL_TTL_MS) } },
    select: { category: true, entityId: true },
  });
  for (const row of rows) map.get(row.category as NotificationCategoryKey)?.add(row.entityId);
  return map;
}

interface OverLimitCustomer {
  id: string;
  name: string;
  creditLimit: number;
  outstanding: number;
  latestActivity: Date | null;
}

// Shared by all four exported functions below (previously copy-pasted once per function) — fetches
// customers with a credit limit set, capped at OVER_LIMIT_CUSTOMER_FETCH_CAP, then aggregates each
// one's outstanding balance and filters down to only those actually over their limit.
async function fetchOverLimitCustomers(idFilter?: IdFilter): Promise<OverLimitCustomer[]> {
  const customersWithLimit = await prisma.customer.findMany({
    where: { deletedAt: null, creditLimit: { not: null }, ...(idFilter ? { id: idFilter } : {}) },
    select: { id: true, name: true, creditLimit: true },
    take: OVER_LIMIT_CUSTOMER_FETCH_CAP,
  });
  if (customersWithLimit.length === 0) return [];

  const sums = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customersWithLimit.map((c) => c.id) }, deletedAt: null },
    _sum: { balanceDue: true },
    _max: { date: true },
  });
  const sumMap = new Map(sums.map((s) => [s.customerId, s._sum.balanceDue ?? 0]));
  // "Latest" for a customer means their most recent invoice activity, not the size of the
  // overage — there's no single "date" a credit-limit breach itself happened.
  const latestMap = new Map(sums.map((s) => [s.customerId, s._max.date]));

  return customersWithLimit
    .map((c) => ({
      id: c.id,
      name: c.name,
      creditLimit: c.creditLimit as number,
      outstanding: sumMap.get(c.id) ?? 0,
      latestActivity: latestMap.get(c.id) ?? null,
    }))
    .filter((c) => c.outstanding > c.creditLimit)
    // Sorted by latest invoice activity descending — sortKey below negates it so ascending
    // client-side comparison reproduces the same "most recent first" order.
    .sort((a, b) => (b.latestActivity?.getTime() ?? 0) - (a.latestActivity?.getTime() ?? 0));
}

function overLimitCustomerToItem(c: OverLimitCustomer): NotificationItem {
  return {
    id: c.id,
    label: c.name,
    detail: `${fmt(c.outstanding)} outstanding — limit ${fmt(c.creditLimit)}`,
    href: `/sales/customers/${c.id}`,
    severity: "critical",
    sortKey: -(c.latestActivity?.getTime() ?? 0),
    timestamp: (c.latestActivity ?? new Date(0)).toISOString(),
  };
}

interface BinExpiringEntity {
  id: string;
  name: string;
  deletedAt: Date;
  daysLeft: number;
}

// Shared by all four exported functions below — every soft-deleted row (across the 6 bin-eligible
// entity types) within BIN_SOON_THRESHOLD_DAYS of its 30-day auto-purge.
async function fetchBinExpiringEntities(idFilter?: IdFilter): Promise<BinExpiringEntity[]> {
  const now = new Date();
  const cutoffPurge = new Date(now.getTime() - BIN_PURGE_DAYS * 24 * 60 * 60 * 1000);
  const cutoffSoon = new Date(now.getTime() - (BIN_PURGE_DAYS - BIN_SOON_THRESHOLD_DAYS) * 24 * 60 * 60 * 1000);
  const soonWhere = { deletedAt: { not: null, gte: cutoffPurge, lte: cutoffSoon }, ...(idFilter ? { id: idFilter } : {}) };

  const [customers, products, brands, categories, vendors, rateLists] = await Promise.all([
    prisma.customer.findMany({ where: soonWhere, select: { id: true, name: true, deletedAt: true } }),
    prisma.product.findMany({ where: soonWhere, select: { id: true, name: true, deletedAt: true } }),
    prisma.brand.findMany({ where: soonWhere, select: { id: true, name: true, deletedAt: true } }),
    prisma.category.findMany({ where: soonWhere, select: { id: true, name: true, deletedAt: true } }),
    prisma.vendor.findMany({ where: soonWhere, select: { id: true, name: true, deletedAt: true } }),
    prisma.rateList.findMany({ where: soonWhere, select: { id: true, title: true, deletedAt: true } }),
  ]);
  const dayMs = 24 * 60 * 60 * 1000;
  return [
    ...customers.map((c) => ({ id: c.id, name: c.name, deletedAt: c.deletedAt as Date })),
    ...products.map((p) => ({ id: p.id, name: p.name, deletedAt: p.deletedAt as Date })),
    ...brands.map((b) => ({ id: b.id, name: b.name, deletedAt: b.deletedAt as Date })),
    ...categories.map((c) => ({ id: c.id, name: c.name, deletedAt: c.deletedAt as Date })),
    ...vendors.map((v) => ({ id: v.id, name: v.name, deletedAt: v.deletedAt as Date })),
    ...rateLists.map((r) => ({ id: r.id, name: r.title, deletedAt: r.deletedAt as Date })),
  ]
    .map((x) => ({ ...x, daysLeft: Math.max(0, BIN_PURGE_DAYS - Math.floor((now.getTime() - x.deletedAt.getTime()) / dayMs)) }))
    // Most recently moved to the bin first, not soonest-to-purge first.
    .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

function binEntityToItem(x: BinExpiringEntity): NotificationItem {
  return {
    id: x.id,
    label: x.name,
    detail: `${x.daysLeft} day${x.daysLeft === 1 ? "" : "s"} left before auto-purge`,
    href: "/bin",
    severity: x.daysLeft <= 2 ? "critical" : "warning",
    sortKey: -x.deletedAt.getTime(),
    timestamp: x.deletedAt.toISOString(),
  };
}

// A live "needs attention" summary, not a persisted notification log — every count/item here is
// derived from current data, so it never needs its own read/unread state or schema beyond the
// dismissal rows themselves. `includeBin` should be false for managers, who have no Bin access
// (mirrors requireWriteAccess()).
export async function getNotificationSummary(opts: { includeBin: boolean; userId: string }): Promise<NotificationSummary> {
  const { userId, includeBin } = opts;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const categories = includeBin ? NOTIFICATION_CATEGORY_KEYS : NOTIFICATION_CATEGORY_KEYS.filter((c) => c !== "binExpiring");
  const dismissalMap = await getActiveDismissalMap(userId, categories);
  const dismissedStock = dismissalMap.get("stock") ?? new Set<string>();
  const dismissedInvoices = dismissalMap.get("overdueInvoices") ?? new Set<string>();
  const dismissedBills = dismissalMap.get("overdueBills") ?? new Set<string>();
  const dismissedCustomers = dismissalMap.get("overLimitCustomers") ?? new Set<string>();
  const dismissedBin = dismissalMap.get("binExpiring") ?? new Set<string>();
  const notDismissed = (ids: Set<string>): IdFilter | undefined => (ids.size ? { notIn: [...ids] } : undefined);

  const [
    outOfStockCount, lowStockCount, stockRows,
    overdueInvoiceCount, overdueInvoiceRows,
    overdueBillCount, overdueBillRows,
    overLimitCustomers,
    binExpiringEntities,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null, stock: { lte: 0 }, id: notDismissed(dismissedStock) } }),
    prisma.product.count({ where: { deletedAt: null, isLowStock: true, id: notDismissed(dismissedStock) } }),
    prisma.product.findMany({
      where: { deletedAt: null, OR: [{ stock: { lte: 0 } }, { isLowStock: true }], id: notDismissed(dismissedStock) },
      select: { id: true, name: true, stock: true, minStock: true, unit: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: ITEM_LIMIT,
    }),
    prisma.invoice.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedInvoices) } }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedInvoices) },
      select: { id: true, invoiceNumber: true, balanceDue: true, dueDate: true, customer: { select: { name: true } } },
      orderBy: { dueDate: "desc" },
      take: ITEM_LIMIT,
    }),
    prisma.purchaseBill.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedBills) } }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedBills) },
      select: { id: true, billNumber: true, balanceDue: true, dueDate: true, vendor: { select: { name: true } } },
      orderBy: { dueDate: "desc" },
      take: ITEM_LIMIT,
    }),
    fetchOverLimitCustomers(notDismissed(dismissedCustomers)),
    includeBin ? fetchBinExpiringEntities(notDismissed(dismissedBin)) : Promise.resolve([]),
  ]);

  return {
    stock: {
      count: outOfStockCount + lowStockCount,
      outOfStockCount,
      lowStockCount,
      items: stockRows.map((p) => ({
        id: p.id,
        label: p.name,
        detail: p.stock <= 0 ? "Out of stock" : `${p.stock} ${p.unit} left (min ${p.minStock})`,
        href: `/products/${p.id}`,
        severity: (p.stock <= 0 ? "critical" : "warning") as NotificationSeverity,
        // Most recently changed stock first — negated so ascending client-side comparison
        // reproduces the server's "most recent first" order.
        sortKey: -p.updatedAt.getTime(),
        timestamp: p.updatedAt.toISOString(),
      })),
    },
    overdueInvoices: {
      count: overdueInvoiceCount,
      items: overdueInvoiceRows.map((inv) => {
        const days = daysOverdue(inv.dueDate as Date, now);
        return {
          id: inv.id,
          label: inv.invoiceNumber,
          detail: `${inv.customer.name} — ${fmt(inv.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
          href: `/sales/invoices/${inv.id}`,
          severity: overdueSeverity(days),
          sortKey: -(inv.dueDate as Date).getTime(),
          timestamp: (inv.dueDate as Date).toISOString(),
        };
      }),
    },
    overdueBills: {
      count: overdueBillCount,
      items: overdueBillRows.map((b) => {
        const days = daysOverdue(b.dueDate as Date, now);
        return {
          id: b.id,
          label: b.billNumber,
          detail: `${b.vendor.name} — ${fmt(b.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
          href: `/purchases/bills/${b.id}`,
          severity: overdueSeverity(days),
          sortKey: -(b.dueDate as Date).getTime(),
          timestamp: (b.dueDate as Date).toISOString(),
        };
      }),
    },
    overLimitCustomers: {
      count: overLimitCustomers.length,
      items: overLimitCustomers.slice(0, ITEM_LIMIT).map(overLimitCustomerToItem),
    },
    binExpiring: includeBin
      ? { count: binExpiringEntities.length, items: binExpiringEntities.slice(0, ITEM_LIMIT).map(binEntityToItem) }
      : null,
  };
}

const DISMISSED_ITEM_LIMIT = 50;

// The dismissed-items counterpart to getNotificationSummary — same shape, but flipped: only items
// currently in an active (not-yet-expired) dismissal AND still matching the underlying alert
// condition (e.g. an invoice dismissed while overdue that's since been paid drops off here too,
// same as it would from the active list — nothing to "undo" for it anymore). Powers the popover's
// "View dismissed" panel so a dismissal isn't a one-way trip until the 24h TTL or tomorrow.
export async function getDismissedNotificationSummary(opts: { includeBin: boolean; userId: string }): Promise<NotificationSummary> {
  const { userId, includeBin } = opts;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const categories = includeBin ? NOTIFICATION_CATEGORY_KEYS : NOTIFICATION_CATEGORY_KEYS.filter((c) => c !== "binExpiring");
  const dismissalMap = await getActiveDismissalMap(userId, categories);
  const dismissedStock = dismissalMap.get("stock") ?? new Set<string>();
  const dismissedInvoices = dismissalMap.get("overdueInvoices") ?? new Set<string>();
  const dismissedBills = dismissalMap.get("overdueBills") ?? new Set<string>();
  const dismissedCustomers = dismissalMap.get("overLimitCustomers") ?? new Set<string>();
  const dismissedBin = dismissalMap.get("binExpiring") ?? new Set<string>();

  if (!dismissedStock.size && !dismissedInvoices.size && !dismissedBills.size && !dismissedCustomers.size && !dismissedBin.size) {
    return {
      stock: { count: 0, outOfStockCount: 0, lowStockCount: 0, items: [] },
      overdueInvoices: { count: 0, items: [] },
      overdueBills: { count: 0, items: [] },
      overLimitCustomers: { count: 0, items: [] },
      binExpiring: includeBin ? { count: 0, items: [] } : null,
    };
  }
  const onlyDismissed = (ids: Set<string>): IdFilter => ({ in: [...ids] });

  const [
    stockRows,
    overdueInvoiceRows,
    overdueBillRows,
    overLimitCustomers,
    binExpiringEntities,
  ] = await Promise.all([
    dismissedStock.size
      ? prisma.product.findMany({
          where: { deletedAt: null, OR: [{ stock: { lte: 0 } }, { isLowStock: true }], id: onlyDismissed(dismissedStock) },
          select: { id: true, name: true, stock: true, minStock: true, unit: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: DISMISSED_ITEM_LIMIT,
        })
      : Promise.resolve([]),
    dismissedInvoices.size
      ? prisma.invoice.findMany({
          where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: onlyDismissed(dismissedInvoices) },
          select: { id: true, invoiceNumber: true, balanceDue: true, dueDate: true, customer: { select: { name: true } } },
          orderBy: { dueDate: "desc" },
          take: DISMISSED_ITEM_LIMIT,
        })
      : Promise.resolve([]),
    dismissedBills.size
      ? prisma.purchaseBill.findMany({
          where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: onlyDismissed(dismissedBills) },
          select: { id: true, billNumber: true, balanceDue: true, dueDate: true, vendor: { select: { name: true } } },
          orderBy: { dueDate: "desc" },
          take: DISMISSED_ITEM_LIMIT,
        })
      : Promise.resolve([]),
    dismissedCustomers.size ? fetchOverLimitCustomers(onlyDismissed(dismissedCustomers)) : Promise.resolve([]),
    includeBin && dismissedBin.size ? fetchBinExpiringEntities(onlyDismissed(dismissedBin)) : Promise.resolve([]),
  ]);

  const stockOutCount = stockRows.filter((p) => p.stock <= 0).length;

  return {
    stock: {
      count: stockRows.length,
      outOfStockCount: stockOutCount,
      lowStockCount: stockRows.length - stockOutCount,
      items: stockRows.map((p) => ({
        id: p.id,
        label: p.name,
        detail: p.stock <= 0 ? "Out of stock" : `${p.stock} ${p.unit} left (min ${p.minStock})`,
        href: `/products/${p.id}`,
        severity: (p.stock <= 0 ? "critical" : "warning") as NotificationSeverity,
        sortKey: -p.updatedAt.getTime(),
        timestamp: p.updatedAt.toISOString(),
      })),
    },
    overdueInvoices: {
      count: overdueInvoiceRows.length,
      items: overdueInvoiceRows.map((inv) => {
        const days = daysOverdue(inv.dueDate as Date, now);
        return {
          id: inv.id,
          label: inv.invoiceNumber,
          detail: `${inv.customer.name} — ${fmt(inv.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
          href: `/sales/invoices/${inv.id}`,
          severity: overdueSeverity(days),
          sortKey: -(inv.dueDate as Date).getTime(),
          timestamp: (inv.dueDate as Date).toISOString(),
        };
      }),
    },
    overdueBills: {
      count: overdueBillRows.length,
      items: overdueBillRows.map((b) => {
        const days = daysOverdue(b.dueDate as Date, now);
        return {
          id: b.id,
          label: b.billNumber,
          detail: `${b.vendor.name} — ${fmt(b.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
          href: `/purchases/bills/${b.id}`,
          severity: overdueSeverity(days),
          sortKey: -(b.dueDate as Date).getTime(),
          timestamp: (b.dueDate as Date).toISOString(),
        };
      }),
    },
    overLimitCustomers: {
      count: overLimitCustomers.length,
      items: overLimitCustomers.slice(0, DISMISSED_ITEM_LIMIT).map(overLimitCustomerToItem),
    },
    binExpiring: includeBin
      ? { count: binExpiringEntities.length, items: binExpiringEntities.slice(0, DISMISSED_ITEM_LIMIT).map(binEntityToItem) }
      : null,
  };
}

// Full (uncapped) id lists per category, respecting existing dismissals — used only by "Clear all",
// which must dismiss every currently-active item, not just the top few shown in the dropdown.
export async function getAllActiveNotificationIds(userId: string, includeBin: boolean): Promise<Record<NotificationCategoryKey, string[]>> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const categories = includeBin ? NOTIFICATION_CATEGORY_KEYS : NOTIFICATION_CATEGORY_KEYS.filter((c) => c !== "binExpiring");
  const dismissalMap = await getActiveDismissalMap(userId, categories);
  const dismissedStock = dismissalMap.get("stock") ?? new Set<string>();
  const dismissedInvoices = dismissalMap.get("overdueInvoices") ?? new Set<string>();
  const dismissedBills = dismissalMap.get("overdueBills") ?? new Set<string>();
  const dismissedCustomers = dismissalMap.get("overLimitCustomers") ?? new Set<string>();
  const dismissedBin = dismissalMap.get("binExpiring") ?? new Set<string>();
  const notDismissed = (ids: Set<string>): IdFilter | undefined => (ids.size ? { notIn: [...ids] } : undefined);

  const [stockRows, invoiceRows, billRows, overLimitCustomers, binExpiringEntities] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null, OR: [{ stock: { lte: 0 } }, { isLowStock: true }], id: notDismissed(dismissedStock) },
      select: { id: true },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedInvoices) },
      select: { id: true },
    }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed(dismissedBills) },
      select: { id: true },
    }),
    fetchOverLimitCustomers(notDismissed(dismissedCustomers)),
    includeBin ? fetchBinExpiringEntities(notDismissed(dismissedBin)) : Promise.resolve([]),
  ]);

  return {
    stock: stockRows.map((p) => p.id),
    overdueInvoices: invoiceRows.map((i) => i.id),
    overdueBills: billRows.map((b) => b.id),
    overLimitCustomers: overLimitCustomers.map((c) => c.id),
    binExpiring: binExpiringEntities.map((x) => x.id),
  };
}

// A generous cap for the "Show all" expand within one category, not a hard page size — this is
// still a popover panel, not a paginated list page (that's what each category's own link, e.g.
// "View All Overdue Invoices", is for).
const CATEGORY_ITEM_LIMIT = 200;

// One category's full (uncapped-to-5) active item list, same filters/sort as
// getNotificationSummary's own construction of that category — powers the popover's per-section
// "Show all" expand, so seeing everything doesn't require leaving the dropdown.
export async function getNotificationCategoryItems(userId: string, category: NotificationCategoryKey): Promise<NotificationItem[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dismissalMap = await getActiveDismissalMap(userId, [category]);
  const dismissed = dismissalMap.get(category) ?? new Set<string>();
  const notDismissed: IdFilter | undefined = dismissed.size ? { notIn: [...dismissed] } : undefined;

  if (category === "stock") {
    const rows = await prisma.product.findMany({
      where: { deletedAt: null, OR: [{ stock: { lte: 0 } }, { isLowStock: true }], id: notDismissed },
      select: { id: true, name: true, stock: true, minStock: true, unit: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: CATEGORY_ITEM_LIMIT,
    });
    return rows.map((p) => ({
      id: p.id,
      label: p.name,
      detail: p.stock <= 0 ? "Out of stock" : `${p.stock} ${p.unit} left (min ${p.minStock})`,
      href: `/products/${p.id}`,
      severity: (p.stock <= 0 ? "critical" : "warning") as NotificationSeverity,
      sortKey: -p.updatedAt.getTime(),
      timestamp: p.updatedAt.toISOString(),
    }));
  }

  if (category === "overdueInvoices") {
    const rows = await prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed },
      select: { id: true, invoiceNumber: true, balanceDue: true, dueDate: true, customer: { select: { name: true } } },
      orderBy: { dueDate: "desc" },
      take: CATEGORY_ITEM_LIMIT,
    });
    return rows.map((inv) => {
      const days = daysOverdue(inv.dueDate as Date, now);
      return {
        id: inv.id,
        label: inv.invoiceNumber,
        detail: `${inv.customer.name} — ${fmt(inv.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
        href: `/sales/invoices/${inv.id}`,
        severity: overdueSeverity(days),
        sortKey: -(inv.dueDate as Date).getTime(),
        timestamp: (inv.dueDate as Date).toISOString(),
      };
    });
  }

  if (category === "overdueBills") {
    const rows = await prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, id: notDismissed },
      select: { id: true, billNumber: true, balanceDue: true, dueDate: true, vendor: { select: { name: true } } },
      orderBy: { dueDate: "desc" },
      take: CATEGORY_ITEM_LIMIT,
    });
    return rows.map((b) => {
      const days = daysOverdue(b.dueDate as Date, now);
      return {
        id: b.id,
        label: b.billNumber,
        detail: `${b.vendor.name} — ${fmt(b.balanceDue)}, ${days} day${days === 1 ? "" : "s"} overdue`,
        href: `/purchases/bills/${b.id}`,
        severity: overdueSeverity(days),
        sortKey: -(b.dueDate as Date).getTime(),
        timestamp: (b.dueDate as Date).toISOString(),
      };
    });
  }

  if (category === "overLimitCustomers") {
    const overLimitCustomers = await fetchOverLimitCustomers(notDismissed);
    return overLimitCustomers.slice(0, CATEGORY_ITEM_LIMIT).map(overLimitCustomerToItem);
  }

  // binExpiring
  const binExpiringEntities = await fetchBinExpiringEntities(notDismissed);
  return binExpiringEntities.slice(0, CATEGORY_ITEM_LIMIT).map(binEntityToItem);
}
