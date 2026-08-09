"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Cell, type Column } from "@/components/ui/Table";
import { animateSection } from "@/lib/animateSection";
import { formatDate } from "@/lib/formatDate";
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

interface PurchasePaymentListResponse {
  data: PurchasePayment[];
  total: number;
}

interface PurchasePaymentStats {
  totalPaid: number;
  totalCount: number;
}

type SortOption = "newest" | "oldest" | "amount_high" | "amount_low" | "vendor_az" | "vendor_za";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",      label: "Newest first" },
  { value: "oldest",      label: "Oldest first" },
  { value: "amount_high", label: "Amount (High–Low)" },
  { value: "amount_low",  label: "Amount (Low–High)" },
  { value: "vendor_az",   label: "Vendor (A–Z)" },
  { value: "vendor_za",   label: "Vendor (Z–A)" },
];

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
  const { data: session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    if (!session.user?.sections?.includes("payments_made")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = showAll ? 5000 : PAGE_SIZE;

  const listParams = new URLSearchParams();
  if (debouncedSearch.trim()) listParams.set("search", debouncedSearch.trim());
  listParams.set("sort", sort);
  listParams.set("page", String(page));
  listParams.set("pageSize", String(pageSize));
  const apiUrl = `/api/purchase-bills/payments?${listParams.toString()}`;

  const { data, loading } = useFetch<PurchasePaymentListResponse>(apiUrl);
  const { data: stats } = useFetch<PurchasePaymentStats>("/api/purchase-bills/payments/stats");
  const payments = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPaid = stats?.totalPaid ?? 0;

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments Made</h1>
          <p className="page-sub">
            {loading ? "Loading…" : `${total} payments · Total paid ₹${totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
      </div>

      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search purchase payments"
              placeholder="Search by vendor, bill no, method or reference…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort purchase payments" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
          {!loading && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={COLUMNS} />
              ) : payments.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search ? "No payments match your search." : "No purchase payments recorded yet."}
                </td></tr>
              ) : payments.map((p) => {
                const methodClass = styles[METHOD_CLASS[p.method] ?? METHOD_CLASS.Other];
                return (
                  <tr key={p.id}>
                    <Cell col={COLUMNS[0]} className={styles.dateCell}>
                      <div>{formatDate(p.date)}</div>
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
                      ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 && (
          <Pagination total={total} page={page} showAll={showAll} onPage={setPage} label="payments" />
        )}
      </div>
    </div>
  );
}
