import { ProtectedSection } from "./sections";

export interface NavItem {
  href: string;
  label: string;
  iconKey: string;
  adminOnly: boolean;
  sectionRequired?: ProtectedSection;
  sectionsRequired?: ProtectedSection[];
  /** Extra search synonyms beyond the label itself (e.g. "GST" for GST Reports). */
  keywords?: string[];
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Single source of truth for every top-level dashboard page: the sidebar
 * (`DashboardShell`) renders from this, and global search (`/api/search`)
 * indexes it too. Add a page here once and it shows up in both places
 * automatically — no separate registration step needed.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", iconKey: "dashboard", adminOnly: false },
    ],
  },
  {
    label: "SALES",
    items: [
      { href: "/sales",             label: "Sales Overview",    iconKey: "salesDashboard", adminOnly: false, sectionRequired: "sales_overview" },
      { href: "/sales/customers",   label: "Customers",         iconKey: "customers",      adminOnly: false },
      { href: "/sales/invoices",    label: "Invoices",          iconKey: "invoices",       adminOnly: false },
      { href: "/sales/credit-notes", label: "Credit Notes",     iconKey: "creditNotes",    adminOnly: false, keywords: ["returns"] },
      { href: "/sales/payments",    label: "Payments Received", iconKey: "payments",       adminOnly: false, sectionRequired: "payments_received" },
    ],
  },
  {
    label: "PURCHASES",
    items: [
      { href: "/purchases",          label: "Purchase Overview", iconKey: "purchaseDashboard", adminOnly: false, sectionRequired: "purchase_overview" },
      { href: "/purchases/vendors",  label: "Vendors",           iconKey: "vendors",            adminOnly: false },
      { href: "/purchases/bills",    label: "Purchase Bills",    iconKey: "purchases",          adminOnly: false },
      { href: "/purchases/payments", label: "Payments Made",     iconKey: "paymentsMade",       adminOnly: false, sectionRequired: "payments_made" },
    ],
  },
  {
    label: "CATALOG",
    items: [
      { href: "/products",   label: "Products",   iconKey: "products", adminOnly: false },
      { href: "/brands",     label: "Brands",      iconKey: "brands",   adminOnly: false },
      { href: "/categories", label: "Categories",  iconKey: "categories", adminOnly: false },
    ],
  },
  {
    label: "REPORTS",
    items: [
      { href: "/reports/sales",      label: "Sales Reports",    iconKey: "reportsSales",     adminOnly: false, sectionRequired: "reports_sales" },
      { href: "/reports/purchases",  label: "Purchase Reports", iconKey: "reportsPurchases", adminOnly: false, sectionRequired: "reports_purchases" },
      { href: "/reports/gst-reports", label: "GST Reports",     iconKey: "gstFiling",        adminOnly: false, sectionsRequired: ["reports_sales", "reports_purchases"], keywords: ["gstin", "gst filing", "gst summary"] },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/admin",    label: "Admin",    iconKey: "admin",    adminOnly: true, keywords: ["users", "staff", "activity log", "profile"] },
      { href: "/settings", label: "Settings", iconKey: "settings", adminOnly: true, keywords: ["business settings", "bank", "gmail", "email", "gstin", "pan", "terms"] },
    ],
  },
];

export const BIN_NAV: NavItem = { href: "/bin", label: "Recycle Bin", iconKey: "bin", adminOnly: false, keywords: ["deleted", "trash"] };

/** A searchable sub-section within a larger settings/admin page (deep-links via `#anchor`). */
export interface SubPageEntry {
  id: string;
  title: string;
  href: string;
  keywords?: string[];
  adminOnly: boolean;
}

/**
 * Sub-sections of `/settings` and `/admin` that aren't separate nav pages
 * but are still things a user searches for by name. Add an entry here
 * (and a matching `id="..."` on the section in the page) to make a new
 * settings sub-section searchable and deep-linkable.
 */
export const SETTINGS_SUBSECTIONS: SubPageEntry[] = [
  { id: "branding", title: "Branding / Logo", href: "/settings#branding", keywords: ["logo"], adminOnly: true },
  { id: "identity", title: "Business Identity", href: "/settings#identity", keywords: ["business name", "gstin", "pan", "tagline"], adminOnly: true },
  { id: "address", title: "Business Address", href: "/settings#address", keywords: ["city", "state", "pincode"], adminOnly: true },
  { id: "bank-details", title: "Bank Details", href: "/settings#bank-details", keywords: ["bank account", "ifsc", "branch"], adminOnly: true },
  { id: "terms", title: "Terms & Conditions", href: "/settings#terms", keywords: ["invoice terms"], adminOnly: true },
  { id: "email", title: "Gmail / Email Settings", href: "/settings#email", keywords: ["gmail", "send invoice", "app password", "smtp"], adminOnly: true },
];

export const ADMIN_SUBSECTIONS: SubPageEntry[] = [
  { id: "profile", title: "My Profile", href: "/admin#profile", keywords: ["change password", "my account"], adminOnly: true },
  { id: "users", title: "User Management", href: "/admin#users", keywords: ["add user", "staff", "manager", "roles"], adminOnly: true },
  { id: "activity-log", title: "Activity Log", href: "/admin#activity-log", keywords: ["audit log", "history"], adminOnly: true },
];
