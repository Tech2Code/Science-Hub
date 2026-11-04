import type { Prisma } from "@prisma/client";

/**
 * ActivityLog is mostly an audit trail, but a few of its rows are read back by the app as STATE:
 *   - `delete_customer` / `delete_vendor` are how the app tells a customer/vendor that was explicitly
 *     moved to the Recycle Bin apart from a hidden "one-off" row (both are soft-deleted; only the log
 *     records which is which). Without it a binned customer vanishes from the Bin and can be picked on
 *     new invoices again.
 *   - `add_*` rows are the only record of who created a product/brand/category/customer/vendor
 *     (the "Created by" column).
 * So these rows must survive the 30-day retention purge, "Delete All", single-entry delete, and
 * deleting the user who wrote them (their log rows would otherwise cascade away with the user).
 * The proper long-term fix is real columns on those tables; until then this list is the contract.
 */
export const STATE_BEARING_ACTIONS: readonly string[] = [
  "delete_customer",
  "delete_vendor",
  "add_customer",
  "add_vendor",
  "add_product",
  "add_brand",
  "add_category",
];

export function isStateBearingAction(action: string): boolean {
  return STATE_BEARING_ACTIONS.includes(action);
}

// Rows tied to GST-numbered documents (invoices/purchase bills/credit notes) are retained as long as the
// documents themselves are, which is indefinitely.
export const PURGE_EXEMPT_ENTITY_TYPES: readonly string[] = ["invoice", "purchase_bill", "return"];
export const ACTIVITY_LOG_RETENTION_DAYS = 30;

/** Which rows the lazy 30-day purge may delete. */
export function buildActivityPurgeWhere(cutoff: Date): Prisma.ActivityLogWhereInput {
  return {
    createdAt: { lt: cutoff },
    action: { notIn: [...STATE_BEARING_ACTIONS] },
    // Explicit OR (rather than NOT: { entityType: { in } }) so rows with a null entityType (logins,
    // settings changes, ...) are still purged — SQL's NULL IN (...) is neither true nor false.
    OR: [{ entityType: null }, { entityType: { notIn: [...PURGE_EXEMPT_ENTITY_TYPES] } }],
  };
}

/** Which rows "Delete All" may delete: everything except the state-bearing rows. */
export function buildActivityClearWhere(): Prisma.ActivityLogWhereInput {
  return { action: { notIn: [...STATE_BEARING_ACTIONS] } };
}
