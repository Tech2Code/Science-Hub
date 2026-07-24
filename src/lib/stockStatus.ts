// Single, shared definition of "is this product low on stock / out of
// stock?" — used by every dashboard/report summary and every product list
// page, so a business user sees the exact same numbers everywhere instead
// of three subtly different counts (as previously happened: the dashboard
// summary counted zero-stock as "low," the products-list tabs treated
// out-of-stock and low-stock as separate buckets, and that same page's
// per-row badge went back to the zero-inclusive definition).
//
// Out of stock and low stock are mutually exclusive: a product is either
// out of stock, low on stock, or neither — never both.
export function isOutOfStock(stock: number): boolean {
  return stock <= 0;
}

export function isLowStock(stock: number, minStock: number): boolean {
  return stock > 0 && stock <= minStock;
}

// True if the product needs restocking attention for any reason (out of
// stock or low). Useful for a single combined banner/alert; the individual
// checks above should still be used wherever "low" and "out" are shown as
// distinct buckets (tabs, badges, counts).
export function needsRestock(stock: number, minStock: number): boolean {
  return isOutOfStock(stock) || isLowStock(stock, minStock);
}
