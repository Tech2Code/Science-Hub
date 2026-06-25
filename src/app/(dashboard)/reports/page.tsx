"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";

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

const OUT_COLUMNS: Column[] = [
  { label: "Invoice No.",   mobile: "label" },
  { label: "Customer",      mobile: "label" },
  { label: "Invoice Date",  mobile: "label" },
  { label: "Due Date",      mobile: "label" },
  { label: "Total",         cls: "table-th-right", mobile: "label" },
  { label: "Paid",          cls: "table-th-right", mobile: "label" },
  { label: "Balance",       cls: "table-th-right", mobile: "full+label" },
  { label: "Status",        mobile: "full+label" },
];

const STOCK_COLUMNS: Column[] = [
  { label: "Product",       mobile: "full+label" },
  { label: "Brand",         mobile: "label" },
  { label: "SKU",           mobile: "label" },
  { label: "Current Stock", cls: "table-th-right", mobile: "label" },
  { label: "Min Stock",     cls: "table-th-right", mobile: "label" },
  { label: "Deficit",       cls: "table-th-right", mobile: "full+label" },
];

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
                {OUT_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loadingOutstanding ? (
                <TableSkeleton cols={OUT_COLUMNS.length} />
              ) : outstanding.length === 0 ? (
                <tr><td colSpan={OUT_COLUMNS.length} className="table-empty-cell">
                  No outstanding payments. All invoices are settled.
                </td></tr>
              ) : visibleOut.map((inv) => {
                const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                return (
                  <tr key={inv.id} style={isOverdue ? { background: "var(--c-red-bg)" } : undefined}>
                    <Cell col={OUT_COLUMNS[0]}>
                      <Link href={`/invoices/${inv.id}`} className="table-link">
                        {inv.invoiceNumber}
                      </Link>
                    </Cell>
                    <Cell col={OUT_COLUMNS[1]} style={{ color: "var(--c-text-2)" }}>{inv.customer.name}</Cell>
                    <Cell col={OUT_COLUMNS[2]} style={{ color: "var(--c-text-3)" }}>
                      <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div className="date-sub">
                        {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </Cell>
                    <Cell col={OUT_COLUMNS[3]}>
                      {inv.dueDate ? (
                        <span style={{ color: isOverdue ? "var(--c-red)" : "var(--c-text-3)", fontWeight: isOverdue ? 500 : undefined }}>
                          {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                          {isOverdue && " ⚠"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--c-text-4)" }}>—</span>
                      )}
                    </Cell>
                    <Cell col={OUT_COLUMNS[4]} style={{ color: "var(--c-text-2)" }}>₹{inv.total.toLocaleString("en-IN")}</Cell>
                    <Cell col={OUT_COLUMNS[5]} style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN")}</Cell>
                    <Cell col={OUT_COLUMNS[6]} style={{ fontWeight: 500, color: "var(--c-text)" }}>
                      ₹{(inv.total - inv.paidAmount).toLocaleString("en-IN")}
                    </Cell>
                    <Cell col={OUT_COLUMNS[7]}><StatusBadge status={inv.status} /></Cell>
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
                {STOCK_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loadingStock ? (
                <TableSkeleton cols={STOCK_COLUMNS.length} />
              ) : lowStock.length === 0 ? (
                <tr><td colSpan={STOCK_COLUMNS.length} className="table-empty-cell">
                  All products are adequately stocked.
                </td></tr>
              ) : lowStock.map((p) => {
                const deficit = p.minStock - p.stock;
                const critical = p.stock === 0;
                return (
                  <tr key={p.id} style={critical ? { background: "var(--c-red-bg)" } : undefined}>
                    <Cell col={STOCK_COLUMNS[0]} style={{ fontWeight: 500, color: "var(--c-text)" }}>
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
                    </Cell>
                    <Cell col={STOCK_COLUMNS[1]} style={{ color: "var(--c-text-3)" }}>{p.brand?.name || "—"}</Cell>
                    <Cell col={STOCK_COLUMNS[2]} style={{ color: "var(--c-text-4)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{p.sku || "—"}</Cell>
                    <Cell col={STOCK_COLUMNS[3]}>
                      <span style={{ fontWeight: 600, color: critical ? "var(--c-red)" : "var(--c-amber)" }}>
                        {p.stock} {p.unit}
                      </span>
                    </Cell>
                    <Cell col={STOCK_COLUMNS[4]} style={{ color: "var(--c-text-3)" }}>{p.minStock} {p.unit}</Cell>
                    <Cell col={STOCK_COLUMNS[5]} style={{ fontWeight: 500, color: "var(--c-red)" }}>
                      {deficit > 0 ? `−${deficit} ${p.unit}` : "—"}
                    </Cell>
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
