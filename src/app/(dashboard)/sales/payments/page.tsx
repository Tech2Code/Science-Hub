"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";
import styles from "./salesPayments.module.css";

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

const METHOD_CLASS: Record<string, string> = {
  Cash: "methodCash",
  UPI: "methodUpi",
  NEFT: "methodNeft",
  RTGS: "methodRtgs",
  Cheque: "methodCheque",
  Card: "methodCard",
  Other: "methodOther",
};

const COLUMNS: Column[] = [
  { label: "Date",      mobile: "label" },
  { label: "Customer",  mobile: "label" },
  { label: "Invoice",   mobile: "label" },
  { label: "Method",    mobile: "label" },
  { label: "Reference", mobile: "full+label" },
  { label: "Amount",    cls: "table-th-right", mobile: "full+label" },
];

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
        <Button variant="primary" href="/sales/invoices/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by customer, invoice no, method or reference…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className={`search-input ${styles.searchInput}`}
          />
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                {COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={COLUMNS.length} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search ? "No payments match your search." : "No payments recorded yet."}
                </td></tr>
              ) : visible.map((p) => {
                const methodClass = styles[METHOD_CLASS[p.method] ?? METHOD_CLASS.Other];
                return (
                  <tr key={p.id}>
                    <Cell col={COLUMNS[0]} className={styles.dateCell}>
                      <div>{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div className={styles.dateSub}>
                        {new Date(p.date).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </Cell>
                    <Cell col={COLUMNS[1]} className={styles.customerCell}>{p.invoice.customer.name}</Cell>
                    <Cell col={COLUMNS[2]}>
                      <Link href={`/sales/invoices/${p.invoiceId}`} className={styles.invoiceLink}>
                        {p.invoice.invoiceNumber}
                      </Link>
                    </Cell>
                    <Cell col={COLUMNS[3]}>
                      <span className={`${styles.methodBadge} ${methodClass}`}>
                        {p.method}
                      </span>
                    </Cell>
                    <Cell col={COLUMNS[4]} className={styles.referenceCell}>
                      {p.reference || "—"}
                    </Cell>
                    <Cell col={COLUMNS[5]} className={styles.amountCell}>
                      ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </Cell>
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
