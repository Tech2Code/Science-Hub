# Graph Report - D:/nextApps/science-hub  (2026-07-03)

## Corpus Check
- 114 files · ~106,304 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 583 nodes · 1262 edges · 49 communities (39 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_List Pages & Shared UI|List Pages & Shared UI]]
- [[_COMMUNITY_Dashboard & Detail Views|Dashboard & Detail Views]]
- [[_COMMUNITY_Package Dependencies & Scripts|Package Dependencies & Scripts]]
- [[_COMMUNITY_CRUD API Routes & Activity Log|CRUD API Routes & Activity Log]]
- [[_COMMUNITY_App Shell & Theme|App Shell & Theme]]
- [[_COMMUNITY_CustomerVendor Forms|Customer/Vendor Forms]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Core DB Queries & Settings API|Core DB Queries & Settings API]]
- [[_COMMUNITY_Admin & Login Pages|Admin & Login Pages]]
- [[_COMMUNITY_Invoice Creation & Auth Pages|Invoice Creation & Auth Pages]]
- [[_COMMUNITY_Auth & Misc API Routes|Auth & Misc API Routes]]
- [[_COMMUNITY_Payments & Setup API|Payments & Setup API]]
- [[_COMMUNITY_Product Creation & Buttons|Product Creation & Buttons]]
- [[_COMMUNITY_Docs Architecture Overview|Docs: Architecture Overview]]
- [[_COMMUNITY_Product Edit & Input Fields|Product Edit & Input Fields]]
- [[_COMMUNITY_Purchase Bill Creation|Purchase Bill Creation]]
- [[_COMMUNITY_Invoice Detail View|Invoice Detail View]]
- [[_COMMUNITY_Docs Conventions & Known Issues|Docs: Conventions & Known Issues]]
- [[_COMMUNITY_Purchase Bill Detail View|Purchase Bill Detail View]]
- [[_COMMUNITY_Docs Numbering & Forbidden Patterns|Docs: Numbering & Forbidden Patterns]]
- [[_COMMUNITY_Reports API & Queries|Reports API & Queries]]
- [[_COMMUNITY_Purchase Bill Edit|Purchase Bill Edit]]
- [[_COMMUNITY_Business Settings Page|Business Settings Page]]
- [[_COMMUNITY_Toast Notifications|Toast Notifications]]
- [[_COMMUNITY_Invoice Edit Page|Invoice Edit Page]]
- [[_COMMUNITY_Admin User Management API|Admin User Management API]]
- [[_COMMUNITY_Docs Tech Stack & API Reference|Docs: Tech Stack & API Reference]]
- [[_COMMUNITY_Docs Key Files Reference|Docs: Key Files Reference]]
- [[_COMMUNITY_Docs Database Models & Modules|Docs: Database Models & Modules]]
- [[_COMMUNITY_Admin Profile API|Admin Profile API]]
- [[_COMMUNITY_Admin Users List API|Admin Users List API]]
- [[_COMMUNITY_Bin RestoreDelete API|Bin Restore/Delete API]]
- [[_COMMUNITY_Invoice Detail API|Invoice Detail API]]
- [[_COMMUNITY_Purchase Reports API|Purchase Reports API]]
- [[_COMMUNITY_Global Loading Indicator|Global Loading Indicator]]
- [[_COMMUNITY_Customers List API|Customers List API]]
- [[_COMMUNITY_Invoices List API|Invoices List API]]
- [[_COMMUNITY_Docs UI & Error Patterns|Docs: UI & Error Patterns]]
- [[_COMMUNITY_Docs Deployment Notes|Docs: Deployment Notes]]
- [[_COMMUNITY_Mobile Check Script|Mobile Check Script]]
- [[_COMMUNITY_Database Seed Script|Database Seed Script]]
- [[_COMMUNITY_README Getting Started|README: Getting Started]]
- [[_COMMUNITY_Invoice PDF Generator|Invoice PDF Generator]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_NextAuth Type Extensions|NextAuth Type Extensions]]
- [[_COMMUNITY_Business Logo Asset|Business Logo Asset]]

## God Nodes (most connected - your core abstractions)
1. `logActivity()` - 50 edges
2. `useToast()` - 43 edges
3. `Button()` - 31 edges
4. `useFetch()` - 29 edges
5. `authOptions` - 27 edges
6. `usePagination()` - 19 edges
7. `Breadcrumb()` - 17 edges
8. `ConfirmDialog()` - 16 edges
9. `OverlayLoader()` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Directory Structure (STRUCTURE.md)` --semantically_similar_to--> `Project Structure (CLAUDE.md)`  [INFERRED] [semantically similar]
  STRUCTURE.md → CLAUDE.md
- `Tech Stack (STRUCTURE.md)` --semantically_similar_to--> `Tech Stack (CLAUDE.md)`  [INFERRED] [semantically similar]
  STRUCTURE.md → CLAUDE.md
- `Data Flow (STRUCTURE.md)` --semantically_similar_to--> `Data Flow (CLAUDE.md)`  [INFERRED] [semantically similar]
  STRUCTURE.md → CLAUDE.md
- `Cache Tags (STRUCTURE.md)` --semantically_similar_to--> `Cache Tags (CLAUDE.md)`  [INFERRED] [semantically similar]
  STRUCTURE.md → CLAUDE.md
- `Forbidden Patterns Table` --semantically_similar_to--> `Rules — Do Not (CLAUDE.md)`  [INFERRED] [semantically similar]
  STRUCTURE.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Next.js Caching Constraints (use cache forbidden, two-arg revalidateTag, unstable_cache pattern)** — claude_use_cache_forbidden, claude_revalidatetag_two_arg, claude_unstable_cache_pattern, structure_forbidden_patterns [INFERRED 0.85]
- **Sequential Document Numbering Scheme (Invoice & Purchase Bill)** — claude_invoice_number_format, structure_invoice_number_format, structure_bill_number_format, claude_invoices_route_ts [INFERRED 0.85]
- **Soft Delete Pattern Across Entities** — claude_soft_delete_pattern, structure_soft_delete, claude_database_models, structure_database_models [INFERRED 0.80]

## Communities (49 total, 10 thin omitted)

### Community 0 - "List Pages & Shared UI"
Cohesion: 0.06
Nodes (70): BIN_COLUMNS, BinItem, BinPage(), BinType, TYPE_META, TYPE_ORDER, Brand, BrandsPage() (+62 more)

### Community 1 - "Dashboard & Detail Views"
Cohesion: 0.05
Nodes (28): CombinedDashboard, DashboardPage(), fmt(), RecentBill, RecentInvoice, fmt(), MonthlyBar, PurchaseDashboard (+20 more)

### Community 2 - "Package Dependencies & Scripts"
Cohesion: 0.05
Nodes (38): dependencies, @anthropic-ai/sdk, @auth/prisma-adapter, bcryptjs, dotenv, html2canvas, jspdf, next (+30 more)

### Community 3 - "CRUD API Routes & Activity Log"
Cohesion: 0.14
Nodes (13): DELETE(), POST(), PUT(), POST(), DELETE(), PUT(), POST(), BILL_INCLUDE (+5 more)

### Community 4 - "App Shell & Theme"
Cohesion: 0.10
Nodes (17): geistMono, geistSans, metadata, Providers(), allNavItems, BIN_NAV, DashboardShell(), EXACT_MATCH_HREFS (+9 more)

### Community 5 - "Customer/Vendor Forms"
Cohesion: 0.21
Nodes (15): EditVendorPage(), StrForm, NewVendorPage(), StrForm, EditCustomerPage(), INDIA_STATES, INDIA_STATES, NewCustomerPage() (+7 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Core DB Queries & Settings API"
Cohesion: 0.18
Nodes (11): POST(), DELETE(), GET(), PUT(), GET(), POST(), POST(), GET() (+3 more)

### Community 8 - "Admin & Login Pages"
Cohesion: 0.12
Nodes (8): ACTION_META, ActivityLog, AdminPage(), AVATAR_COLORS, Role, User, PasswordInput(), PasswordInputProps

### Community 9 - "Invoice Creation & Auth Pages"
Cohesion: 0.18
Nodes (9): Customer, LineItem, Product, Result, hasErrors(), rules, validate(), validateForm() (+1 more)

### Community 10 - "Auth & Misc API Routes"
Cohesion: 0.16
Nodes (5): handler, POST(), POST(), POST(), authOptions

### Community 11 - "Payments & Setup API"
Cohesion: 0.12
Nodes (3): BILL_INCLUDE, POST(), globalForPrisma

### Community 12 - "Product Creation & Buttons"
Cohesion: 0.16
Nodes (11): Brand, Category, GST_RATES, NewProductPage(), UNITS, ButtonProps, Size, Variant (+3 more)

### Community 13 - "Docs: Architecture Overview"
Cohesion: 0.15
Nodes (13): Cache Tags (CLAUDE.md), Common Tasks (CLAUDE.md), Data Flow (CLAUDE.md), Environment Variables (CLAUDE.md), Features Completed (CLAUDE.md), Important Decisions (CLAUDE.md), Next Actions (CLAUDE.md), Project Overview (Science Hub) (+5 more)

### Community 14 - "Product Edit & Input Fields"
Cohesion: 0.17
Nodes (11): Brand, Category, EditProductPage(), FormData, GST_RATES, UNITS, FieldProps, InputProps (+3 more)

### Community 15 - "Purchase Bill Creation"
Cohesion: 0.19
Nodes (12): BLANK_ITEM, calcItem(), CATEGORIES, fmt(), GST_RATES, LineItem, NewPurchaseBillPage(), PAYMENT_METHODS (+4 more)

### Community 16 - "Invoice Detail View"
Cohesion: 0.17
Nodes (9): BusinessSettings, fmt(), Invoice, InvoiceDetailPage(), InvoiceItem, Payment, PAYMENT_METHODS, ReturnFormItem (+1 more)

### Community 17 - "Docs: Conventions & Known Issues"
Cohesion: 0.18
Nodes (10): Next.js Breaking Changes Notice, Known Issues (CLAUDE.md), Activity Logging Requirement, Auth in API Routes Pattern, How to Add a New Feature, Known Issues / Technical Debt (STRUCTURE.md), logActivity() in src/lib/activity.ts, NAV_GROUPS in layout.tsx (+2 more)

### Community 18 - "Purchase Bill Detail View"
Cohesion: 0.24
Nodes (8): fmt(), fmtDate(), fmtShort(), PAYMENT_METHODS, PurchaseBill, PurchaseBillDetailPage(), PurchaseBillItem, PurchasePayment

### Community 19 - "Docs: Numbering & Forbidden Patterns"
Cohesion: 0.25
Nodes (9): Invoice Number Format Rule (SH-YYYY-0001), src/app/api/invoices/route.ts, Two-Arg revalidateTag Requirement, Rules — Do Not (CLAUDE.md), unstable_cache Server Caching Pattern, 'use cache' Directive Forbidden, Bill Number Format (PB-YYYY-0001), Forbidden Patterns Table (+1 more)

### Community 20 - "Reports API & Queries"
Cohesion: 0.42
Nodes (8): GET(), getCombinedDashboard(), getGstSummary(), getPurchaseDashboard(), getSalesDashboard(), getReportOutstanding(), getReportStock(), getReportSummary()

### Community 21 - "Purchase Bill Edit"
Cohesion: 0.25
Nodes (7): BillItem, CATEGORIES, EditPurchaseBillPage(), fmt(), PurchaseBill, STATUSES, Vendor

### Community 22 - "Business Settings Page"
Cohesion: 0.25
Nodes (4): BusinessSettings, EMPTY, SettingsPage(), FormField()

### Community 23 - "Toast Notifications"
Cohesion: 0.25
Nodes (6): AddToast, CFG, CFG_DARK, ToastCtx, ToastItem, ToastType

### Community 24 - "Invoice Edit Page"
Cohesion: 0.29
Nodes (6): EditInvoicePage(), InvoiceData, LineItem, Product, Sk(), bustCache()

### Community 25 - "Admin User Management API"
Cohesion: 0.47
Nodes (5): DELETE(), GET(), PUT(), requireAdmin(), USER_SELECT

### Community 26 - "Docs: Tech Stack & API Reference"
Cohesion: 0.40
Nodes (5): API Routes Full List (CLAUDE.md), Tech Stack (CLAUDE.md), AI Bill Extraction (Gemini 2.0 Flash), API Reference (STRUCTURE.md), Tech Stack (STRUCTURE.md)

### Community 27 - "Docs: Key Files Reference"
Cohesion: 0.40
Nodes (5): src/lib/auth.ts, src/lib/db.ts, Key Files — Read Before Editing, prisma/schema.prisma, src/lib/useCache.ts

### Community 28 - "Docs: Database Models & Modules"
Cohesion: 0.50
Nodes (5): Database Models Summary (CLAUDE.md), Database Models Complete Schema (STRUCTURE.md), Directory Structure (STRUCTURE.md), Purchases Module (Vendors, PurchaseBill, StockMovement), Sales Module (Customer, Invoice, Payment, Return)

### Community 29 - "Admin Profile API"
Cohesion: 0.60
Nodes (4): GET(), PUT(), resolveSessionUser(), USER_SELECT

### Community 30 - "Admin Users List API"
Cohesion: 0.60
Nodes (4): GET(), POST(), requireAdmin(), USER_SELECT

### Community 31 - "Bin Restore/Delete API"
Cohesion: 0.60
Nodes (4): BinType, DELETE(), getItemName(), POST()

### Community 32 - "Invoice Detail API"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PUT(), getInvoice()

### Community 33 - "Purchase Reports API"
Cohesion: 0.70
Nodes (4): GET(), getPurchaseByCategory(), getPurchaseOutstanding(), getPurchaseSummary()

### Community 35 - "Customers List API"
Cohesion: 0.67
Nodes (3): GET(), POST(), getCustomers()

### Community 36 - "Invoices List API"
Cohesion: 0.67
Nodes (3): GET(), POST(), getInvoices()

### Community 37 - "Docs: UI & Error Patterns"
Cohesion: 0.50
Nodes (4): Component Usage Patterns, Global CSS Classes, Error Handling Pattern, UI Patterns & Conventions

### Community 38 - "Docs: Deployment Notes"
Cohesion: 0.67
Nodes (3): Deployment Notes (CLAUDE.md), postinstall Script (prisma generate), Deployment (STRUCTURE.md)

## Knowledge Gaps
- **224 isolated node(s):** `eslintConfig`, `PAGES`, `SESSION_MOCK`, `nextConfig`, `name` (+219 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useToast()` connect `Customer/Vendor Forms` to `List Pages & Shared UI`, `Admin & Login Pages`, `Invoice Creation & Auth Pages`, `Product Creation & Buttons`, `Product Edit & Input Fields`, `Purchase Bill Creation`, `Invoice Detail View`, `Purchase Bill Detail View`, `Purchase Bill Edit`, `Business Settings Page`, `Toast Notifications`, `Invoice Edit Page`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `Button()` connect `List Pages & Shared UI` to `Dashboard & Detail Views`, `Customer/Vendor Forms`, `Admin & Login Pages`, `Invoice Creation & Auth Pages`, `Product Creation & Buttons`, `Product Edit & Input Fields`, `Purchase Bill Creation`, `Invoice Detail View`, `Purchase Bill Detail View`, `Purchase Bill Edit`, `Business Settings Page`, `Invoice Edit Page`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `PAGES`, `SESSION_MOCK` to the rest of the system?**
  _232 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `List Pages & Shared UI` be split into smaller, more focused modules?**
  _Cohesion score 0.059499489274770175 - nodes in this community are weakly interconnected._
- **Should `Dashboard & Detail Views` be split into smaller, more focused modules?**
  _Cohesion score 0.05314009661835749 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies & Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `CRUD API Routes & Activity Log` be split into smaller, more focused modules?**
  _Cohesion score 0.13538461538461538 - nodes in this community are weakly interconnected._