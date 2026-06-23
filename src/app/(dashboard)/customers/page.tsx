"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface Customer {
  id: string;
  name: string;
  phone: string;
  gstin: string;
  city: string;
  _count?: { invoices: number };
}

export default function CustomersPage() {
  const { data, loading, mutate } = useFetch<Customer[]>("/api/customers");
  const customers = data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
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
        setDeleting(id);
        const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        setConfirmLoading(false);
        setConfirmState(null);
        setDeleting(null);
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
            placeholder="Search by name, phone, GSTIN, or city…"
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
                <th>Name</th>
                <th>Phone</th>
                <th>GSTIN</th>
                <th>City</th>
                <th className="table-th-right">Invoices</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search ? "No customers match your search." : "No customers yet. Add one to get started."}
                </td></tr>
              ) : visible.map((c) => (
                <tr key={c.id}>
                  <td data-mobile-full style={{ fontWeight: 500, color: "var(--c-text)" }}>{c.name}</td>
                  <td data-label="Phone" style={{ color: "var(--c-text-3)" }}>{c.phone || "—"}</td>
                  <td data-mobile-hide style={{ color: "var(--c-text-3)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{c.gstin || "—"}</td>
                  <td data-label="City" style={{ color: "var(--c-text-3)" }}>{c.city || "—"}</td>
                  <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-text-2)" }}>{c._count?.invoices ?? 0}</td>
                  <td data-mobile-full>
                    <div className="table-actions" style={{ flexWrap: "wrap" }}>
                      <Button variant="viewOutline" size="sm" href={`/customers/${c.id}`}>View</Button>
                      <Button variant="editOutline" size="sm" href={`/customers/edit/${c.id}`}>Edit</Button>
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        loading={deleting === c.id}
                        onClick={() => handleDelete(c.id, c.name)}
                      >
                        {deleting === c.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </td>
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
