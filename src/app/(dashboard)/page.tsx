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

        {/* ── Quick Actions — prominent, on top ── */}
        <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--c-text-4)", marginBottom: "1rem" }}>Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.875rem" }}>
            {/* SALES */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--c-blue)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.125rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                Sales
              </div>
              <Button variant="primary"   href="/sales/invoices/new"  size="sm">+ New Invoice</Button>
              <Button variant="secondary" href="/sales/customers/new" size="sm">+ New Customer</Button>
              <Button variant="secondary" href="/sales/invoices"      size="sm">All Invoices</Button>
            </div>
            {/* PURCHASES */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--c-amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.125rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                Purchases
              </div>
              <Button variant="secondary" href="/purchases/bills/new"   size="sm" style={{ background: "rgba(245,158,11,0.1)", borderColor: "var(--c-amber)", color: "var(--c-amber)" }}>+ New Bill</Button>
              <Button variant="secondary" href="/purchases/vendors/new" size="sm">+ New Vendor</Button>
              <Button variant="secondary" href="/purchases/bills"       size="sm">All Bills</Button>
            </div>
            {/* CATALOG + LOW STOCK */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.125rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>
                Catalog
              </div>
              <Button variant="secondary" href="/products/new" size="sm">+ New Product</Button>
              <Button variant="secondary" href="/products"     size="sm">All Products</Button>
              <Button variant="secondary" href="/reports/sales" size="sm">Reports</Button>
            </div>
          </div>
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
