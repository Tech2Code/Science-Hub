"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface Product {
  id: string;
  name: string;
  brand?: { name: string };
  category?: { name: string };
  unit: string;
  price: number;
  gstRate: number;
  stock: number;
  minStock: number;
  sku: string;
  createdAt?: string;
  _count?: { invoiceItems: number };
  createdBy?: string | null;
}

export default function ProductsPage() {
  const { data, loading, mutate } = useFetch<Product[]>("/api/products");
  const products = data ?? [];
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
      title: "Delete Product",
      message: `Delete "${name}"? This will permanently remove it from your catalog.`,
      onConfirm: async () => {
        setConfirmLoading(true);
        const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        setConfirmLoading(false);
        setConfirmState(null);
        if (res.ok) {
          mutate();
          toast({ type: "success", title: "Product deleted", message: `"${name}" removed from catalog.` });
        } else {
          toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete product." });
        }
      },
    });
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.name?.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="page-title">Products</h1>
          <p className="page-sub">{products.length} products in catalog</p>
        </div>
        <Button variant="primary" href="/products/new">+ Add Product</Button>
      </div>

      <Breadcrumb items={[{ label: "Products" }]} />

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            placeholder="Search by name, SKU, brand, or category…"
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
                <th>Brand</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="table-th-right">Price</th>
                <th className="table-th-right">GST %</th>
                <th className="table-th-right">Stock</th>
                <th>Created By</th>
                <th>Created At</th>
                <th className="table-th-right">Invoices</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={11} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search ? "No products match your search." : "No products yet. Add one to get started."}
                </td></tr>
              ) : visible.map((p) => {
                const isLow = p.stock <= p.minStock;
                return (
                  <tr key={p.id}>
                    <td data-mobile-full>
                      <div style={{ fontWeight: 500, color: "var(--c-text)" }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", fontFamily: "var(--font-mono)" }}>{p.sku}</div>}
                    </td>
                    <td data-label="Brand" style={{ color: "var(--c-text-3)" }}>{p.brand?.name ?? "—"}</td>
                    <td data-mobile-hide style={{ color: "var(--c-text-3)" }}>{p.category?.name ?? "—"}</td>
                    <td data-mobile-hide style={{ color: "var(--c-text-3)" }}>{p.unit}</td>
                    <td data-label="Price" className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{p.price.toLocaleString("en-IN")}</td>
                    <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-text-3)" }}>{p.gstRate}%</td>
                    <td data-label="Stock" data-mobile-full className="table-td-right">
                      <span style={{
                        display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "9999px",
                        fontSize: "0.75rem", fontWeight: 500, whiteSpace: "nowrap",
                        background: isLow ? "var(--c-red-bg)" : "var(--c-green-bg)",
                        color: isLow ? "var(--c-red-text)" : "var(--c-green-text)",
                        border: `1px solid ${isLow ? "var(--c-red-border)" : "var(--c-green-border)"}`,
                      }}>
                        {p.stock} {p.unit}{isLow && " ⚠"}
                      </span>
                    </td>
                    <td data-mobile-hide style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{p.createdBy ?? "—"}</td>
                    <td data-mobile-hide style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                    </td>
                    <td data-label="Invoices" className="table-td-right">
                      {(() => {
                        const count = p._count?.invoiceItems ?? 0;
                        return count > 0 ? (
                          <span style={{
                            display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "9999px",
                            fontSize: "0.75rem", fontWeight: 500,
                            background: "var(--c-blue-bg)", color: "var(--c-blue)",
                            border: "1px solid var(--c-blue-border)",
                          }}>{count}</span>
                        ) : (
                          <span style={{ color: "var(--c-text-4)", fontSize: "0.8rem" }}>—</span>
                        );
                      })()}
                    </td>
                    <td data-mobile-full>
                      <div className="table-actions">
                        <Button variant="editOutline" size="sm" href={`/products/edit/${p.id}`}>Edit</Button>
                        <Button
                          variant="dangerOutline"
                          size="sm"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          Delete
                        </Button>
                      </div>
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
            label="products"
          />
        )}
      </div>
    </div>
  );
}
