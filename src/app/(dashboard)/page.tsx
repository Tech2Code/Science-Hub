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
          <Button variant="primary" href="/sales/invoices/new">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Invoice
          </Button>
        </div>

        <SectionLabel>Sales</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          <KpiCard label="Revenue This Month" value={loading ? "—" : fmt(data?.sales.revenueThisMonth ?? 0)} color="var(--c-blue)" loading={loading} />
          <KpiCard label="Outstanding" value={loading ? "—" : fmt(data?.sales.outstandingAmount ?? 0)} color="var(--c-amber)" loading={loading} />
          <KpiCard label="Overdue Invoices" value={loading ? "—" : String(data?.sales.overdueInvoices ?? 0)} color={(data?.sales.overdueInvoices ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
          <KpiCard label="Collected Today" value={loading ? "—" : fmt(data?.sales.collectedToday ?? 0)} color="var(--c-green-text)" loading={loading} />
        </div>

        <SectionLabel>Purchases</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          <KpiCard label="Spend This Month" value={loading ? "—" : fmt(data?.purchases.spendThisMonth ?? 0)} color="var(--c-amber)" loading={loading} />
          <KpiCard label="Payable Balance" value={loading ? "—" : fmt(data?.purchases.payableBalance ?? 0)} color="var(--c-amber)" loading={loading} />
          <KpiCard label="Overdue Bills" value={loading ? "—" : String(data?.purchases.overdueBills ?? 0)} color={(data?.purchases.overdueBills ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
          <KpiCard label="Paid Today" value={loading ? "—" : fmt(data?.purchases.paidToday ?? 0)} color="var(--c-green-text)" loading={loading} />
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

        {/* Low stock + Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.125rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Low Stock Alert</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: (data?.lowStockCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)" }}>
              {loading ? "—" : data?.lowStockCount ?? 0}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>
              {(data?.lowStockCount ?? 0) > 0
                ? <Link href="/products" style={{ color: "var(--c-red)" }}>Products need restocking →</Link>
                : "All products adequately stocked"
              }
            </div>
          </div>

          <div className="card" style={{ padding: "1.125rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>Quick Actions</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <Button variant="primary" href="/sales/invoices/new" size="sm">+ Invoice</Button>
              <Button variant="secondary" href="/sales/customers/new" size="sm">+ Customer</Button>
              <Button variant="secondary" href="/purchases/bills/new" size="sm">+ Bill</Button>
              <Button variant="secondary" href="/purchases/vendors/new" size="sm">+ Vendor</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
