"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";

interface MonthlyBar { month: string; total: number; }
interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface TopCustomer { id: string; name: string; totalBilled: number; totalPaid: number; }
interface SalesDashboard {
  revenueThisMonth: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueCount: number;
  monthlyRevenue: MonthlyBar[];
  fyLabel?: string;
  recentInvoices: RecentInvoice[];
  topCustomers: TopCustomer[];
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const shortFmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
};

function BarChart({ data }: { data: MonthlyBar[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: "160px", padding: "0 0.25rem" }}>
      {data.map((bar, idx) => {
        const pct = (bar.total / max) * 100;
        const isHov = hovered === idx;
        return (
          <div
            key={bar.month}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", height: "100%", cursor: "default" }}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Value label — always visible, full value on hover */}
            <div style={{
              height: "1.25rem",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              fontSize: isHov ? "0.72rem" : "0.6rem",
              fontWeight: isHov ? 700 : 600,
              color: isHov ? "#2563eb" : "var(--c-text-3)",
              whiteSpace: "nowrap",
              transition: "color 0.1s, font-size 0.1s",
            }}>
              {isHov ? fmt(bar.total) : shortFmt(bar.total)}
            </div>
            {/* Bar */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(pct, 2)}%`,
                  background: "linear-gradient(180deg, #3b82f6, #2563eb)",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 0.5s ease, opacity 0.15s",
                  minHeight: 2,
                  opacity: hovered !== null && !isHov ? 0.35 : 1,
                }}
              />
            </div>
            <div style={{
              fontSize: "0.6rem",
              color: isHov ? "var(--c-text-2)" : "var(--c-text-4)",
              textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%",
              fontWeight: isHov ? 600 : 400,
              transition: "color 0.1s",
            }}>
              {bar.month.split(" ")[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub, color = "var(--c-text)", loading }: { label: string; value: string; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div className="card" style={{ padding: "1.125rem 1.25rem" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.375rem" }}>{label}</div>
      {loading
        ? <div style={{ height: 28, borderRadius: 6, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
        : <div style={{ fontSize: "1.375rem", fontWeight: 700, color }}>{value}</div>
      }
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>{sub}</div>}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { data, loading } = useFetch<SalesDashboard>("/api/reports?type=sales-dashboard");

  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Sales Overview</h1>
            <p className="page-sub" suppressHydrationWarning>
              {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" href="/sales/customers/new">+ Customer</Button>
            <Button variant="primary" href="/sales/invoices/new">+ Invoice</Button>
          </div>
        </div>

        {/* Quick actions — on top */}
        <div className="card" style={{ padding: "1.125rem 1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "0.75rem" }}>Quick Actions</h2>
          <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
            <Button variant="primary" href="/sales/invoices/new">+ New Invoice</Button>
            <Button variant="secondary" href="/sales/customers/new">+ New Customer</Button>
            <Button variant="secondary" href="/sales/invoices">All Invoices</Button>
            <Button variant="secondary" href="/sales/customers">All Customers</Button>
            <Button variant="secondary" href="/reports/sales">Sales Reports</Button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.875rem" }}>
          <KpiCard label="Revenue This Month" value={loading ? "—" : fmt(data?.revenueThisMonth ?? 0)} sub="total billed" loading={loading} color="var(--c-blue)" />
          <KpiCard label="Total Collected" value={loading ? "—" : fmt(data?.totalCollected ?? 0)} sub="all time" loading={loading} color="var(--c-green-text)" />
          <KpiCard label="Outstanding Balance" value={loading ? "—" : fmt(data?.outstandingBalance ?? 0)} sub="pending collection" loading={loading} color="var(--c-amber)" />
          <KpiCard label="Overdue Invoices" value={loading ? "—" : String(data?.overdueCount ?? 0)} sub="past due date" loading={loading} color={(data?.overdueCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} />
        </div>

        {/* Monthly bar chart */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "1rem" }}>Monthly Revenue — {data?.fyLabel ?? "Current FY"}</h2>
          {loading || !data?.monthlyRevenue?.length
            ? <div style={{ height: 120, background: "var(--c-bg-sub)", borderRadius: 8, animation: "skPulse 1.4s ease-in-out infinite" }} />
            : <BarChart data={data.monthlyRevenue} />
          }
        </div>

        {/* Recent invoices + Top customers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {/* Recent Invoices */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Recent Invoices</h2>
              <Link href="/sales/invoices" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={4}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                    ))
                  ) : (data?.recentInvoices ?? []).length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--c-text-4)" }}>No invoices yet.</td></tr>
                  ) : (data?.recentInvoices ?? []).map((inv) => (
                    <tr key={inv.id}>
                      <td><Link href={`/sales/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>{inv.invoiceNumber}</Link></td>
                      <td style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.customerName}</td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{inv.total.toLocaleString("en-IN")}</td>
                      <td><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Customers */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Top 5 Customers</h2>
              <Link href="/sales/customers" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th style={{ textAlign: "right" }}>Billed</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={3}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                    ))
                  ) : (data?.topCustomers ?? []).length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--c-text-4)" }}>No customers yet.</td></tr>
                  ) : (data?.topCustomers ?? []).map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/sales/customers/${c.id}`} style={{ fontWeight: 500, color: "var(--c-text)", textDecoration: "none" }}>{c.name}</Link></td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{c.totalBilled.toLocaleString("en-IN")}</td>
                      <td style={{ textAlign: "right", color: (c.totalBilled - c.totalPaid) > 0 ? "var(--c-amber)" : "var(--c-green-text)" }}>
                        ₹{(c.totalBilled - c.totalPaid).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
