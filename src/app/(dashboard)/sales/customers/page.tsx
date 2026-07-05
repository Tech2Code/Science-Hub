"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import styles from "./customersList.module.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  city: string;
  createdAt?: string;
  _count?: { invoices: number };
  createdBy?: string | null;
}

const COLUMNS: Column[] = [
  { label: "Name",          mobile: "full+label" },
  { label: "Phone / Email", mobile: "label" },
  { label: "GSTIN",         mobile: "label" },
  { label: "City",          mobile: "label" },
  { label: "Created By",    mobile: "label" },
  { label: "Created At",    mobile: "label" },
  { label: "Invoices",      cls: "table-th-right", mobile: "label" },
  { label: "Actions",       mobile: "full+label" },
];

export default function CustomersPage() {
  const { data, loading, mutate } = useFetch<Customer[]>("/api/customers");
  const customers = data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  function handleDelete(id: string, name: string) {
    setConfirmState({
      title: "Delete Customer",
      message: `Delete "${name}"? All associated data will be permanently removed.`,
      onConfirm: async () => {
        setConfirmLoading(true);
        const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        setConfirmLoading(false);
        setConfirmState(null);
        if (res.ok) {
          mutate();
          toast({ type: "success", title: "Customer deleted", message: `"${name}" removed.` });
        } else {
          toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete customer." });
        }
      },
    });
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.gstin?.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage); // eslint-disable-line react-hooks/set-state-in-effect -- clamps page back into range when filtering shrinks the result set
  }, [filtered.length, page]);

  const { visible } = usePagination(filtered, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  return (
    <div className="page-stack">
      {openingEditId && <OverlayLoader text="Opening editor…" />}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel="Delete"
        variant="danger"
        loading={confirmLoading}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onCancel={() => { if (!confirmLoading) setConfirmState(null); }}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">{customers.length} total customers</p>
        </div>
        <Button variant="primary" href="/sales/customers/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Customer</Button>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by name, phone, email, GSTIN, or city…"
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
                <tr><td colSpan={COLUMNS.length} className="table-empty-cell">
                  {search ? "No customers match your search." : "No customers yet. Add one to get started."}
                </td></tr>
              ) : visible.map((c) => (
                <tr key={c.id}>
                  <Cell col={COLUMNS[0]} className={styles.nameCell}>{c.name}</Cell>
                  <Cell col={COLUMNS[1]} className={styles.mutedCell}>
                    <div>{c.phone || "—"}</div>
                    {c.email && <div className="date-sub">{c.email}</div>}
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.gstinCell}>{c.gstin || "—"}</Cell>
                  <Cell col={COLUMNS[3]} className={styles.mutedCell}>{c.city || "—"}</Cell>
                  <Cell col={COLUMNS[4]} className={styles.smallMutedCell}>{c.createdBy ?? "—"}</Cell>
                  <Cell col={COLUMNS[5]} className={styles.smallMutedCell}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                  </Cell>
                  <Cell col={COLUMNS[6]} className={styles.countCell}>{c._count?.invoices ?? 0}</Cell>
                  <Cell col={COLUMNS[7]}>
                    <div className={`table-actions ${styles.actionsWrap}`}>
                      <Button variant="viewOutline" size="sm" href={`/sales/customers/${c.id}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</Button>
                      <Button variant="editOutline" size="sm" onClick={() => { setOpeningEditId(c.id); router.push(`/sales/customers/edit/${c.id}`); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => handleDelete(c.id, c.name)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete</Button>
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="customers"
          />
        )}
      </div>
    </div>
  );
}
