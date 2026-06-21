"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";

interface OutstandingItem {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  dueDate?: string;
  customer: { name: string };
  total: number;
  paidAmount: number;
  balance: number;
  status: string;
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  minStock: number;
  brand?: { name: string };
}

export default function ReportsPage() {
  const { data: outstandingData, loading: loadingOutstanding } = useFetch<OutstandingItem[]>("/api/reports?type=outstanding");
  const { data: lowStockData,    loading: loadingStock }       = useFetch<LowStockItem[]>("/api/reports?type=stock");
  const outstanding = outstandingData ?? [];
  const lowStock    = lowStockData    ?? [];

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);

  const { visible: visibleOut } = usePagination(outstanding, outPage, outShowAll);

  const totalOutstanding = outstanding.reduce((sum, i) => sum + (i.total - i.paidAmount), 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Outstanding payments and inventory alerts</p>
        </div>
      </div>

      {/* Summary banners */}
      <div className="stat-banners">
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Outstanding</div>
          <div className="stat-banner-value">₹{totalOutstanding.toLocaleString("en-IN")}</div>
          <div className="stat-banner-sub">
            Across {outstanding.length} unpaid/partial invoice{outstanding.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="stat-banner stat-banner-red">
          <div className="stat-banner-label">Low Stock Alerts</div>
          <div className="stat-banner-value">{loadingStock ? "—" : lowStock.length}</div>
          <div className="stat-banner-sub">
            Product{lowStock.length !== 1 ? "s" : ""} at or below minimum stock level
          </div>
        </div>
      </div>

      {/* Outstanding payments */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-header-title">Outstanding Payments</h2>
            <p className="card-header-sub">Invoices awaiting full payment</p>
          </div>
          {!loadingOutstanding && (
            <ShowAllToggle total={outstanding.length} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingOutstanding ? (
                <TableSkeleton cols={8} />
              ) : outstanding.length === 0 ? (
                <tr><td colSpan={8} className="table-empty-cell">
                  No outstanding payments. All invoices are settled.
                </td></tr>
              ) : visibleOut.map((inv) => {
                const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                return (
                  <tr key={inv.id} style={isOverdue ? { background: "var(--c-red-bg)" } : undefined}>
                    <td>
                      <Link href={`/invoices/${inv.id}`} className="table-link">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td style={{ color: "var(--c-text-2)" }}>{inv.customer.name}</td>
                    <td style={{ color: "var(--c-text-3)" }}>
                      <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div className="date-sub">
                        {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </td>
                    <td>
                      {inv.dueDate ? (
                        <span style={{ color: isOverdue ? "var(--c-red)" : "var(--c-text-3)", fontWeight: isOverdue ? 500 : undefined }}>
                          {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                          {isOverdue && " ⚠"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--c-text-4)" }}>—</span>
                      )}
                    </td>
                    <td className="table-td-right" style={{ color: "var(--c-text-2)" }}>₹{inv.total.toLocaleString("en-IN")}</td>
                    <td className="table-td-right" style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN")}</td>
                    <td className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>
                      ₹{(inv.total - inv.paidAmount).toLocaleString("en-IN")}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loadingOutstanding && outstanding.length > 0 && (
          <Pagination
            total={outstanding.length}
            page={outPage}
            showAll={outShowAll}
            onPage={setOutPage}
            label="invoices"
          />
        )}
      </div>

      {/* Low stock alerts — no pagination, "View all products" link already navigates there */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-header-title">Low Stock Alerts</h2>
            <p className="card-header-sub">Products at or below their minimum stock level</p>
          </div>
          <Link href="/products" className="card-view-all">
            View all products →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>SKU</th>
                <th className="table-th-right">Current Stock</th>
                <th className="table-th-right">Min Stock</th>
                <th className="table-th-right">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {loadingStock ? (
                <TableSkeleton cols={6} />
              ) : lowStock.length === 0 ? (
                <tr><td colSpan={6} className="table-empty-cell">
                  All products are adequately stocked.
                </td></tr>
              ) : lowStock.map((p) => {
                const deficit = p.minStock - p.stock;
                const critical = p.stock === 0;
                return (
                  <tr key={p.id} style={critical ? { background: "var(--c-red-bg)" } : undefined}>
                    <td style={{ fontWeight: 500, color: "var(--c-text)" }}>
                      <Link href={`/products/edit/${p.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-blue)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "inherit")}>
                        {p.name}
                      </Link>
                      {critical && (
                        <span style={{
                          marginLeft: "0.5rem", fontSize: "0.7rem", fontWeight: 500,
                          padding: "0.125rem 0.375rem", borderRadius: "9999px",
                          background: "var(--c-red-bg)", color: "var(--c-red)",
                          border: "1px solid var(--c-red-border)",
                        }}>
                          Out of stock
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--c-text-3)" }}>{p.brand?.name || "—"}</td>
                    <td style={{ color: "var(--c-text-4)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{p.sku || "—"}</td>
                    <td className="table-td-right">
                      <span style={{ fontWeight: 600, color: critical ? "var(--c-red)" : "var(--c-amber)" }}>
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td className="table-td-right" style={{ color: "var(--c-text-3)" }}>{p.minStock} {p.unit}</td>
                    <td className="table-td-right" style={{ fontWeight: 500, color: "var(--c-red)" }}>
                      {deficit > 0 ? `−${deficit} ${p.unit}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
