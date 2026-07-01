"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";

interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface CombinedDashboard {
  sales: {
    revenueThisMonth: number;
    outstandingAmount: number;
    overdueInvoices: number;
    collectedToday: number;
    recentInvoices: RecentInvoice[];
  };
  purchases: {
    spendThisMonth: number;
    payableBalance: number;
    overdueBills: number;
    paidToday: number;
    recentBills: RecentBill[];
  };
  lowStockCount: number;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--c-text-4)", textTransform: "uppercase", paddingBottom: "0.25rem", borderBottom: "1px solid var(--c-border)", marginTop: "0.25rem" }}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, color = "var(--c-text)", loading }: { label: string; value: string; color?: string; loading?: boolean }) {
  return (
    <div className="card" style={{ padding: "1rem 1.125rem" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.3rem" }}>{label}</div>
      {loading
        ? <div style={{ height: 24, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
        : <div style={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</div>
      }
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading } = useFetch<CombinedDashboard>("/api/reports?type=combined-dashboard");

  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-sub" suppressHydrationWarning>
              {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })} overview
            </p>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text-2)" }}>Quick Actions</span>
          </div>

          {/* SALES row */}
          {[
            {
              key: "sales",
              label: "Sales", color: "#2563eb", borderColor: "var(--c-blue)",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
              actions: [
                { label: "+ New Invoice",   href: "/sales/invoices/new",  primary: true  },
                { label: "+ New Customer",  href: "/sales/customers/new", primary: false },
                { label: "All Invoices",    href: "/sales/invoices",      primary: false },
                { label: "All Customers",   href: "/sales/customers",     primary: false },
              ],
            },
            {
              key: "purchases",
              label: "Purchases", color: "#d97706", borderColor: "var(--c-amber)",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
              actions: [
                { label: "+ New Bill",     href: "/purchases/bills/new",   primary: true  },
                { label: "+ New Vendor",   href: "/purchases/vendors/new", primary: false },
                { label: "All Bills",      href: "/purchases/bills",       primary: false },
                { label: "All Vendors",    href: "/purchases/vendors",     primary: false },
              ],
            },
            {
              key: "catalog",
              label: "Catalog", color: "#64748b", borderColor: "var(--c-border-md)",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
              actions: [
                { label: "+ New Product",  href: "/products/new",    primary: true  },
                { label: "All Products",   href: "/products",        primary: false },
                { label: "Sales Reports",  href: "/reports/sales",   primary: false },
                { label: "Buy Reports",    href: "/reports/purchases",primary: false },
              ],
            },
          ].map((section, sIdx) => (
            <div key={section.key} style={{
              display: "flex", alignItems: "center", gap: "1rem",
              padding: "0.75rem 1.25rem",
              borderBottom: sIdx < 2 ? "1px solid var(--c-border)" : "none",
              flexWrap: "wrap",
            }}>
              {/* Section label — fixed width column */}
              <div style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                color: section.color, minWidth: "80px", flexShrink: 0,
              }}>
                <span style={{ width: 3, height: 16, borderRadius: 9999, background: section.color, flexShrink: 0, display: "inline-block" }} />
                {section.icon}
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {section.label}
                </span>
              </div>
              {/* Action chips */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}>
                {section.actions.map(a => (
                  <Link
                    key={a.href} href={a.href}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "0.375rem 0.875rem",
                      borderRadius: "9999px",
                      fontSize: "0.8125rem", fontWeight: 500,
                      textDecoration: "none", whiteSpace: "nowrap",
                      border: `1px solid ${a.primary ? section.borderColor : "var(--c-border)"}`,
                      background: a.primary ? section.color : "transparent",
                      color: a.primary ? "#fff" : "var(--c-text-2)",
                      transition: "opacity 0.15s, box-shadow 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sales & Purchases side-by-side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {/* SALES half */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <SectionLabel>Sales</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <KpiCard label="Revenue This Month" value={loading ? "—" : fmt(data?.sales.revenueThisMonth ?? 0)} color="var(--c-blue)" loading={loading} />
              <KpiCard label="Outstanding" value={loading ? "—" : fmt(data?.sales.outstandingAmount ?? 0)} color="var(--c-amber)" loading={loading} />
              <KpiCard label="Overdue Invoices" value={loading ? "—" : String(data?.sales.overdueInvoices ?? 0)} color={(data?.sales.overdueInvoices ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
              <KpiCard label="Collected Today" value={loading ? "—" : fmt(data?.sales.collectedToday ?? 0)} color="var(--c-green-text)" loading={loading} />
            </div>
          </div>
          {/* PURCHASES half */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <SectionLabel>Purchases</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <KpiCard label="Spend This Month" value={loading ? "—" : fmt(data?.purchases.spendThisMonth ?? 0)} color="var(--c-amber)" loading={loading} />
              <KpiCard label="Payable Balance" value={loading ? "—" : fmt(data?.purchases.payableBalance ?? 0)} color="var(--c-amber)" loading={loading} />
              <KpiCard label="Overdue Bills" value={loading ? "—" : String(data?.purchases.overdueBills ?? 0)} color={(data?.purchases.overdueBills ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
              <KpiCard label="Paid Today" value={loading ? "—" : fmt(data?.purchases.paidToday ?? 0)} color="var(--c-green-text)" loading={loading} />
            </div>
          </div>
        </div>

        {/* Recent invoices & bills */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Recent Invoices</h2>
              <Link href="/sales/invoices" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead><tr><th>Invoice</th><th>Customer</th><th style={{ textAlign: "right" }}>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {loading ? [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={4}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                  )) : (data?.sales.recentInvoices ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="table-empty-cell">No invoices yet. <Link href="/sales/invoices/new" style={{ color: "var(--c-blue)" }}>Create one →</Link></td></tr>
                  ) : (data?.sales.recentInvoices ?? []).map((inv) => (
                    <tr key={inv.id}>
                      <td><Link href={`/sales/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>{inv.invoiceNumber}</Link></td>
                      <td style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{inv.customerName}</td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{inv.total.toLocaleString("en-IN")}</td>
                      <td><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Recent Purchase Bills</h2>
              <Link href="/purchases/bills" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead><tr><th>Bill</th><th>Vendor</th><th style={{ textAlign: "right" }}>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {loading ? [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={4}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                  )) : (data?.purchases.recentBills ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="table-empty-cell">No bills yet. <Link href="/purchases/bills/new" style={{ color: "var(--c-blue)" }}>Create one →</Link></td></tr>
                  ) : (data?.purchases.recentBills ?? []).map((b) => (
                    <tr key={b.id}>
                      <td><Link href={`/purchases/bills/${b.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>{b.billNumber}</Link></td>
                      <td style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{b.vendorName}</td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{b.total.toLocaleString("en-IN")}</td>
                      <td><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Low stock alert */}
        {!loading && (data?.lowStockCount ?? 0) > 0 && (
          <div className="card" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", borderLeft: "3px solid var(--c-red)" }}>
            <div style={{ flexShrink: 0, width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: "var(--c-red)", fontSize: "0.875rem" }}>
                {data?.lowStockCount} product{(data?.lowStockCount ?? 0) > 1 ? "s" : ""} running low on stock
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>Review and restock to avoid stockouts</div>
            </div>
            <Button variant="secondary" size="sm" href="/products">View Products →</Button>
          </div>
        )}
      </div>
    </>
  );
}
