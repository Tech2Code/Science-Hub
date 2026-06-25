"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";

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
  const toast = useToast();

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
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page]);

  const { visible } = usePagination(filtered, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  return (
    <div className="page-stack">
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
        <Button variant="primary" href="/customers/new">+ Add Customer</Button>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by name, phone, email, GSTIN, or city…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
            style={{ flex: 1 }}
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
                <tr><td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search ? "No customers match your search." : "No customers yet. Add one to get started."}
                </td></tr>
              ) : visible.map((c) => (
                <tr key={c.id}>
                  <Cell col={COLUMNS[0]} style={{ fontWeight: 500, color: "var(--c-text)" }}>{c.name}</Cell>
                  <Cell col={COLUMNS[1]} style={{ color: "var(--c-text-3)" }}>
                    <div>{c.phone || "—"}</div>
                    {c.email && <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginTop: 2 }}>{c.email}</div>}
                  </Cell>
                  <Cell col={COLUMNS[2]} style={{ color: "var(--c-text-3)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{c.gstin || "—"}</Cell>
                  <Cell col={COLUMNS[3]} style={{ color: "var(--c-text-3)" }}>{c.city || "—"}</Cell>
                  <Cell col={COLUMNS[4]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{c.createdBy ?? "—"}</Cell>
                  <Cell col={COLUMNS[5]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                  </Cell>
                  <Cell col={COLUMNS[6]} style={{ color: "var(--c-text-2)" }}>{c._count?.invoices ?? 0}</Cell>
                  <Cell col={COLUMNS[7]}>
                    <div className="table-actions" style={{ flexWrap: "wrap" }}>
                      <Button variant="viewOutline" size="sm" href={`/customers/${c.id}`}>View</Button>
                      <Button variant="editOutline" size="sm" href={`/customers/edit/${c.id}`}>Edit</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => handleDelete(c.id, c.name)}>Delete</Button>
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
