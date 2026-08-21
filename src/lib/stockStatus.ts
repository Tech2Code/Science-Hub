// Single shared "low/out of stock" definition, used everywhere so numbers can't disagree across pages.
//
// Out of stock and low stock are mutually exclusive: a product is either
// out of stock, low on stock, or neither — never both.
export function isOutOfStock(stock: number): boolean {
  return stock <= 0;
}

export function isLowStock(stock: number, minStock: number): boolean {
  return stock > 0 && stock <= minStock;
}

// True if out of stock or low — for a combined banner; use the individual checks where "low"/"out" need distinct buckets.
export function needsRestock(stock: number, minStock: number): boolean {
  return isOutOfStock(stock) || isLowStock(stock, minStock);
}
