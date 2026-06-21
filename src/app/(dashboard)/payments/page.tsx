"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";

interface Payment {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  invoiceId: string;
  invoice: {
    invoiceNumber: string;
    total: number;
    customer: { name: string };
  };
}

const METHOD_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Cash:   { bg: "var(--c-green-bg)",  color: "var(--c-green-text)",  border: "var(--c-green-border)" },
  UPI:    { bg: "var(--c-blue-bg)",   color: "var(--c-blue-text)",   border: "var(--c-blue-border)"  },
  NEFT:   { bg: "var(--c-blue-bg)",   color: "var(--c-blue)",        border: "var(--c-blue-border)"  },
  RTGS:   { bg: "var(--c-blue-bg)",   color: "var(--c-blue)",        border: "var(--c-blue-border)"  },
  Cheque: { bg: "var(--c-amber-bg)",  color: "var(--c-amber)",       border: "var(--c-amber-border)" },
  Card:   { bg: "var(--c-bg-sub)",    color: "var(--c-text-2)",      border: "var(--c-border)"       },
  Other:  { bg: "var(--c-bg-sub)",    color: "var(--c-text-3)",      border: "var(--c-border)"       },
};

export default function PaymentsPage() {
  const { data, loading } = useFetch<Payment[]>("/api/payments");
  const payments = data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const filtered = payments.filter((p) =>
    p.invoice.customer.name.toLowerCase().includes(search.toLowerCase()) ||
    p.invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    p.method.toLowerCase().includes(search.toLowerCase()) ||
    (p.reference ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const { visible } = usePagination(filtered, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">
            {payments.length} payments · Total collected ₹{totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <Button variant="primary" href="/invoices/new">+ New Invoice</Button>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by customer, invoice no, method or reference…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
            style={{ maxWidth: "28rem" }}
          />
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="table-th-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search ? "No payments match your search." : "No payments recorded yet."}
                </td></tr>
              ) : visible.map((p) => {
                const mc = METHOD_COLORS[p.method] ?? METHOD_COLORS.Other;
                return (
                  <tr key={p.id}>
                    <td style={{ color: "var(--c-text-3)" }}>
                      <div>{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                        {new Date(p.date).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </td>
                    <td style={{ fontWeight: 500, color: "var(--c-text)" }}>{p.invoice.customer.name}</td>
                    <td>
                      <Link href={`/invoices/${p.invoiceId}`}
                        style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                        {p.invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "9999px",
                        fontSize: "0.75rem", fontWeight: 500,
                        background: mc.bg, color: mc.color, border: `1px solid ${mc.border}`,
                      }}>
                        {p.method}
                      </span>
                    </td>
                    <td style={{ color: "var(--c-text-4)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                      {p.reference || "—"}
                    </td>
                    <td className="table-td-right" style={{ fontWeight: 600, color: "var(--c-green)" }}>
                      ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="payments"
          />
        )}
      </div>
    </div>
  );
}
