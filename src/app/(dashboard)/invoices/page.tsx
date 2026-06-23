"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  customer: { name: string };
  total: number;
  paidAmount: number;
  status: string;
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid";
const STATUS_TABS: StatusFilter[] = ["All", "unpaid", "partial", "paid"];

export default function InvoicesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const apiUrl = filter === "All" ? "/api/invoices" : `/api/invoices?status=${filter}`;
  const { data, loading } = useFetch<Invoice[]>(apiUrl);
  const invoices = data ?? [];

  useEffect(() => { setPage(1); }, [filter]);

  const { visible } = usePagination(invoices, page, showAll);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">{invoices.length} invoices</p>
        </div>
        <Button variant="primary" href="/invoices/new">+ New Invoice</Button>
      </div>

      {/* Status filter tabs + show-all toggle */}
      <div className="filter-tabs-row">
        <div className="filter-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={["filter-tab", filter === tab ? "filter-tab-active" : ""].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>
        {!loading && (
          <ShowAllToggle total={invoices.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={8} />
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  No invoices found.
                </td></tr>
              ) : visible.map((inv) => (
                <tr key={inv.id}>
                  <td data-mobile-full>
                    <a href={`/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                      {inv.invoiceNumber}
                    </a>
                  </td>
                  <td data-mobile-hide style={{ color: "var(--c-text-3)" }}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className="date-sub" style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </td>
                  <td data-label="Customer" style={{ color: "var(--c-text-2)" }}>{inv.customer?.name}</td>
                  <td data-label="Total" className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Balance" className="table-td-right" style={{ color: "var(--c-text)" }}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Status"><StatusBadge status={inv.status} /></td>
                  <td data-mobile-full>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" href={`/invoices/${inv.id}`}>View</Button>
                      <Button variant="viewOutline" size="sm" onClick={() => {
                        const iframe = document.createElement('iframe');
                        Object.assign(iframe.style, { position: 'fixed', width: '0', height: '0', top: '0', left: '0', border: 'none', visibility: 'hidden' });
                        iframe.src = `/invoices/${inv.id}?print=1`;
                        document.body.appendChild(iframe);
                        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 30000);
                      }}>PDF</Button>
                      {inv.status !== "paid" && (
                        <Button variant="editOutline" size="sm" href={`/invoices/edit/${inv.id}`}>Edit</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && invoices.length > 0 && (
          <Pagination
            total={invoices.length}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="invoices"
          />
        )}
      </div>
    </div>
  );
}
