"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";
import { animateSection } from "@/lib/animateSection";
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

type SortOption = "newest" | "oldest" | "amount_high" | "amount_low" | "customer_az" | "customer_za";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",      label: "Newest first" },
  { value: "oldest",      label: "Oldest first" },
  { value: "amount_high", label: "Amount (High–Low)" },
  { value: "amount_low",  label: "Amount (Low–High)" },
  { value: "customer_az", label: "Customer (A–Z)" },
  { value: "customer_za", label: "Customer (Z–A)" },
];

function sortPayments(list: Payment[], sort: SortOption): Payment[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":      return arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    case "amount_high": return arr.sort((a, b) => b.amount - a.amount);
    case "amount_low":  return arr.sort((a, b) => a.amount - b.amount);
    case "customer_az": return arr.sort((a, b) => a.invoice.customer.name.localeCompare(b.invoice.customer.name));
    case "customer_za": return arr.sort((a, b) => b.invoice.customer.name.localeCompare(a.invoice.customer.name));
    case "newest":
    default:            return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
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
  const { data: session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    if (!session.user?.sections?.includes("payments_received")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const { data, loading } = useFetch<Payment[]>("/api/payments");
  const payments = data ?? [];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const filtered = payments.filter((p) =>
    p.invoice.customer.name.toLowerCase().includes(search.toLowerCase()) ||
    p.invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    p.method.toLowerCase().includes(search.toLowerCase()) ||
    (p.reference ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const sorted = sortPayments(filtered, sort);
  const { visible } = usePagination(sorted, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">
            {loading ? "Loading…" : `${payments.length} payments · Total collected ₹${totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
      </div>

      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search payments"
              placeholder="Search by customer, invoice no, method or reference…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort payments" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
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
                      ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
