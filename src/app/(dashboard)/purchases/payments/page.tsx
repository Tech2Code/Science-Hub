"use client";

import { useState } from "react";
import Link from "next/link";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";
import styles from "./purchasePayments.module.css";

interface PurchasePayment {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  purchaseBillId: string;
  purchaseBill: {
    billNumber: string;
    vendor: { name: string };
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
  { label: "Vendor",    mobile: "label" },
  { label: "Bill No.",  mobile: "label" },
  { label: "Method",    mobile: "label" },
  { label: "Reference", mobile: "full+label" },
  { label: "Amount",    cls: "table-th-right", mobile: "full+label" },
];

export default function PurchasePaymentsPage() {
  const { data, loading } = useFetch<PurchasePayment[]>("/api/purchase-bills/payments");
  const payments = data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const filtered = payments.filter((p) =>
    p.purchaseBill.vendor.name.toLowerCase().includes(search.toLowerCase()) ||
    p.purchaseBill.billNumber.toLowerCase().includes(search.toLowerCase()) ||
    p.method.toLowerCase().includes(search.toLowerCase()) ||
    (p.reference ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const { visible } = usePagination(filtered, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments Made</h1>
          <p className="page-sub">
            {payments.length} payments · Total paid ₹{totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by vendor, bill no, method or reference…"
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
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={COLUMNS.length} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search ? "No payments match your search." : "No purchase payments recorded yet."}
                </td></tr>
              ) : visible.map((p) => {
                const methodClass = styles[METHOD_CLASS[p.method] ?? METHOD_CLASS.Other];
                return (
                  <tr key={p.id}>
                    <Cell col={COLUMNS[0]} className={styles.dateCell}>
                      <div>{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    </Cell>
                    <Cell col={COLUMNS[1]} className={styles.vendorCell}>{p.purchaseBill.vendor.name}</Cell>
                    <Cell col={COLUMNS[2]}>
                      <Link href={`/purchases/bills/${p.purchaseBillId}`} className={styles.billLink}>
                        {p.purchaseBill.billNumber}
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
          <Pagination total={filtered.length} page={page} showAll={showAll} onPage={setPage} label="payments" />
        )}
      </div>
    </div>
  );
}
