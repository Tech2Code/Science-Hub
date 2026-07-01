"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";

interface MonthlyBar { month: string; total: number; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface TopVendor { id: string; name: string; totalBilled: number; totalPaid: number; }
interface PurchaseDashboard {
  spendThisMonth: number;
  totalPaid: number;
  payableBalance: number;
  overdueBillsCount: number;
  monthlySpend: MonthlyBar[];
  fyLabel?: string;
  recentBills: RecentBill[];
  topVendors: TopVendor[];
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
              color: isHov ? "#d97706" : "var(--c-text-3)",
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
                  background: "linear-gradient(180deg, #f59e0b, #d97706)",
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

export default function PurchaseDashboardPage() {
  const { data, loading } = useFetch<PurchaseDashboard>("/api/reports?type=purchase-dashboard");

  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Purchase Overview</h1>
            <p className="page-sub" suppressHydrationWarning>
              {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" href="/purchases/vendors/new">+ Vendor</Button>
            <Button variant="primary" href="/purchases/bills/new">+ Bill</Button>
          </div>
        </div>

        {/* Quick actions — on top */}
        <div className="card" style={{ padding: "1.125rem 1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "0.75rem" }}>Quick Actions</h2>
          <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
            <Button variant="primary" href="/purchases/bills/new">+ New Bill</Button>
            <Button variant="secondary" href="/purchases/vendors/new">+ New Vendor</Button>
            <Button variant="secondary" href="/purchases/bills">All Bills</Button>
            <Button variant="secondary" href="/purchases/vendors">All Vendors</Button>
            <Button variant="secondary" href="/reports/purchases">Purchase Reports</Button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.875rem" }}>
          <KpiCard label="Spend This Month" value={loading ? "—" : fmt(data?.spendThisMonth ?? 0)} sub="total billed" loading={loading} color="var(--c-amber)" />
          <KpiCard label="Total Paid" value={loading ? "—" : fmt(data?.totalPaid ?? 0)} sub="all time" loading={loading} color="var(--c-green-text)" />
          <KpiCard label="Payable Balance" value={loading ? "—" : fmt(data?.payableBalance ?? 0)} sub="pending payment" loading={loading} color="var(--c-amber)" />
          <KpiCard label="Overdue Bills" value={loading ? "—" : String(data?.overdueBillsCount ?? 0)} sub="past due date" loading={loading} color={(data?.overdueBillsCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} />
        </div>

        {/* Monthly bar chart */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "1rem" }}>Monthly Spend — {data?.fyLabel ?? "Current FY"}</h2>
          {loading || !data?.monthlySpend?.length
            ? <div style={{ height: 120, background: "var(--c-bg-sub)", borderRadius: 8, animation: "skPulse 1.4s ease-in-out infinite" }} />
            : <BarChart data={data.monthlySpend} />
          }
        </div>

        {/* Recent bills + Top vendors */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Recent Bills</h2>
              <Link href="/purchases/bills" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Vendor</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={4}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                    ))
                  ) : (data?.recentBills ?? []).length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--c-text-4)" }}>No bills yet.</td></tr>
                  ) : (data?.recentBills ?? []).map((b) => (
                    <tr key={b.id}>
                      <td><Link href={`/purchases/bills/${b.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>{b.billNumber}</Link></td>
                      <td style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.vendorName}</td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{b.total.toLocaleString("en-IN")}</td>
                      <td><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Top 5 Vendors</h2>
              <Link href="/purchases/vendors" style={{ fontSize: "0.75rem", color: "var(--c-blue)", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}><td colSpan={3}><div style={{ height: 16, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", margin: "4px 0" }} /></td></tr>
                    ))
                  ) : (data?.topVendors ?? []).length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--c-text-4)" }}>No vendors yet.</td></tr>
                  ) : (data?.topVendors ?? []).map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 500, color: "var(--c-text)" }}>{v.name}</td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>₹{v.totalBilled.toLocaleString("en-IN")}</td>
                      <td style={{ textAlign: "right", color: (v.totalBilled - v.totalPaid) > 0 ? "var(--c-amber)" : "var(--c-green-text)" }}>
                        ₹{(v.totalBilled - v.totalPaid).toLocaleString("en-IN")}
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
