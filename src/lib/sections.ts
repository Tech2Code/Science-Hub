export const PROTECTED_SECTIONS = [
  "sales_overview",
  "purchase_overview",
  "reports_sales",
  "reports_purchases",
  "payments_received",
  "payments_made",
] as const;

export type ProtectedSection = (typeof PROTECTED_SECTIONS)[number];

/** Maps a route path to the section permission required to access it */
export const ROUTE_SECTION_MAP: Record<string, ProtectedSection> = {
  "/sales": "sales_overview",
  "/purchases": "purchase_overview",
  "/reports/sales": "reports_sales",
  "/reports/purchases": "reports_purchases",
  "/sales/payments": "payments_received",
  "/purchases/payments": "payments_made",
};

/** Maps a section to its human-readable label */
export const SECTION_LABELS: Record<ProtectedSection, string> = {
  sales_overview: "Sales Overview",
  purchase_overview: "Purchase Overview",
  reports_sales: "Reports Sales",
  reports_purchases: "Reports Purchases",
  payments_received: "Payments Received",
  payments_made: "Payments Made",
};

/** Sections that control dashboard widget visibility */
export const DASHBOARD_WIDGET_SECTIONS = {
  salesWidgets: "sales_overview" as ProtectedSection,
  purchasesWidgets: "purchase_overview" as ProtectedSection,
};
