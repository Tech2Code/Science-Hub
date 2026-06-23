"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface Brand {
  id: string;
  name: string;
  _count: { products: number };
}

export default function BrandsPage() {
  const { data, loading, mutate } = useFetch<Brand[]>("/api/brands");
  const brands = data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    const r = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNewName("");
      mutate();
      toast({ type: "success", title: "Brand added", message: `"${name}" added to catalog.` });
    } else {
      const d = await r.json();
      setError(d.error ?? "Failed to add brand");
    }
    setSaving(false);
  }

  function handleDelete(id: string, name: string) {
    setConfirmState({
      title: "Delete Brand",
      message: `Delete "${name}"? Products assigned to this brand will be unassigned.`,
      onConfirm: async () => {
        setConfirmLoading(true);
        const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
        setConfirmLoading(false);
        setConfirmState(null);
        if (res.ok) {
          mutate();
          toast({ type: "success", title: "Brand deleted", message: `"${name}" removed.` });
        } else {
          toast({ type: "error", title: "Delete failed", message: "Could not delete brand." });
        }
      },
    });
  }

  const filtered = brands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="page-title">Brands</h1>
          <p className="page-sub">{brands.length} brands in catalog</p>
        </div>
      </div>

      <Breadcrumb items={[{ label: "Brands" }]} />

      {/* Add brand form */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--c-text)", marginBottom: "0.875rem" }}>
          Add New Brand
        </h2>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Brand name (e.g. Merck, Borosil…)"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(""); }}
            className="search-input"
            style={{
              flex: "1 1 260px", minWidth: 0, maxWidth: "none",
              borderColor: error ? "var(--c-red-border)" : undefined,
            }}
          />
          <Button type="submit" variant="primary" loading={saving} fullScreen disabled={!newName.trim()}>
            {saving ? "Adding…" : "+ Add Brand"}
          </Button>
        </form>
        {error && <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--c-red-text)" }}>{error}</p>}
      </div>

      {/* Brands list */}
      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search brands…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
            style={{ maxWidth: "22rem" }}
          />
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Brand Name</th>
                <th className="table-th-right">Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={4} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search ? "No brands match your search." : "No brands yet. Add one above."}
                </td></tr>
              ) : visible.map((b, i) => (
                <tr key={b.id}>
                  <td data-mobile-hide style={{ color: "var(--c-text-4)", fontSize: "0.8125rem" }}>{i + 1}</td>
                  <td data-mobile-full style={{ fontWeight: 500, color: "var(--c-text)" }}>{b.name}</td>
                  <td data-label="Products" className="table-td-right">
                    <span style={{
                      display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "9999px",
                      fontSize: "0.75rem", fontWeight: 500,
                      background: b._count.products > 0 ? "var(--c-blue-bg)" : "var(--c-bg-sub)",
                      color: b._count.products > 0 ? "var(--c-blue-text, #1d4ed8)" : "var(--c-text-4)",
                      border: `1px solid ${b._count.products > 0 ? "var(--c-blue-border, #bfdbfe)" : "var(--c-border)"}`,
                    }}>
                      {b._count.products} {b._count.products === 1 ? "product" : "products"}
                    </span>
                  </td>
                  <td data-mobile-full>
                    <div className="table-actions">
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => handleDelete(b.id, b.name)}
                      >
                        Delete
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
            label="brands"
          />
        )}
      </div>
    </div>
  );
}
