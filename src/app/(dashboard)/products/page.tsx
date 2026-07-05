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
import styles from "./productsList.module.css";

type StockFilter = "all" | "low" | "out";

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

const COLUMNS: Column[] = [
  { label: "Name",       mobile: "full+label" },
  { label: "Brand",      mobile: "label" },
  { label: "Category",   mobile: "label" },
  { label: "Unit",       mobile: "label" },
  { label: "Price",      cls: "table-th-right", mobile: "label" },
  { label: "GST %",      cls: "table-th-right", mobile: "full+label" },
  { label: "Stock",      cls: "table-th-right", mobile: "full+label" },
  { label: "Created By", mobile: "label" },
  { label: "Created At", mobile: "label" },
  { label: "Invoices",   cls: "table-th-right", mobile: "full+label" },
  { label: "Actions",    mobile: "full+label" },
];

export default function ProductsPage() {
  const { data, loading, mutate } = useFetch<Product[]>("/api/products");
  const products = data ?? [];
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [openingEdit, setOpeningEdit] = useState(false);
  const toast = useToast();
  const router = useRouter();

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

  const outOfStockCount = products.filter(p => p.stock === 0).length;
  const lowStockCount   = products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.name?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (stockFilter === "out") return p.stock === 0;
    if (stockFilter === "low") return p.stock > 0 && p.stock <= p.minStock;
    return true;
  });

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage); // eslint-disable-line react-hooks/set-state-in-effect -- clamps page back into range when filtering shrinks the result set
  }, [filtered.length, page]);

  const { visible } = usePagination(filtered, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleStockFilter = (f: StockFilter) => { setStockFilter(f); setPage(1); };

  return (
    <div className="page-stack">
      {openingEdit && <OverlayLoader text="Opening editor…" />}
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
        <Button variant="primary" href="/products/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Product</Button>
      </div>

      <div className="card">
        <div className={`card-toolbar ${styles.toolbar}`}>
          <input
            type="search"
            placeholder="Search by name, SKU, brand, or category…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className={`search-input ${styles.searchInput}`}
          />
          <div className={styles.filterRow}>
            {/* Stock filter tabs */}
            <div className="filter-tabs">
              {([
                { key: "all", label: "All", count: products.length },
                { key: "low", label: "Low Stock", count: lowStockCount, colorCls: styles.filterCountAmber },
                { key: "out", label: "Out of Stock", count: outOfStockCount, colorCls: styles.filterCountRed },
              ] as { key: StockFilter; label: string; count: number; colorCls?: string }[]).map(tab => (
                <button
                  key={tab.key}
                  className={["filter-tab", styles.filterTabInner, stockFilter === tab.key ? "filter-tab-active" : ""].join(" ")}
                  onClick={() => handleStockFilter(tab.key)}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={[
                        styles.filterCount,
                        stockFilter === tab.key && tab.colorCls ? `${styles.filterCountActive} ${tab.colorCls}` : "",
                      ].join(" ")}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!loading && (
              <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
            )}
          </div>
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
                  {stockFilter === "out" ? "No out-of-stock products." : stockFilter === "low" ? "No low-stock products." : search ? "No products match your search." : "No products yet. Add one to get started."}
                </td></tr>
              ) : visible.map((p) => {
                const isLow = p.stock <= p.minStock;
                return (
                  <tr key={p.id}>
                    <Cell col={COLUMNS[0]}>
                      <div className={styles.nameCell}>{p.name}</div>
                      {p.sku && <div className={styles.skuCell}>{p.sku}</div>}
                    </Cell>
                    <Cell col={COLUMNS[1]} className={styles.mutedCell}>{p.brand?.name ?? "—"}</Cell>
                    <Cell col={COLUMNS[2]} className={styles.mutedCell}>{p.category?.name ?? "—"}</Cell>
                    <Cell col={COLUMNS[3]} className={styles.mutedCell}>{p.unit}</Cell>
                    <Cell col={COLUMNS[4]} className={styles.priceCell}>₹{p.price.toLocaleString("en-IN")}</Cell>
                    <Cell col={COLUMNS[5]} className={styles.mutedCell}>{p.gstRate}%</Cell>
                    <Cell col={COLUMNS[6]}>
                      <span className={[styles.stockBadge, isLow ? styles.stockLow : styles.stockOk].join(" ")}>
                        {p.stock} {p.unit}{isLow && " ⚠"}
                      </span>
                    </Cell>
                    <Cell col={COLUMNS[7]} className={styles.metaCell}>{p.createdBy ?? "—"}</Cell>
                    <Cell col={COLUMNS[8]} className={styles.metaCell}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                    </Cell>
                    <Cell col={COLUMNS[9]}>
                      {(() => {
                        const count = p._count?.invoiceItems ?? 0;
                        return count > 0 ? (
                          <span className={styles.invoiceCountBadge}>{count}</span>
                        ) : (
                          <span className={styles.invoiceCountEmpty}>—</span>
                        );
                      })()}
                    </Cell>
                    <Cell col={COLUMNS[10]}>
                      <div className="table-actions">
                        <Button variant="editOutline" size="sm" onClick={() => { setOpeningEdit(true); router.push(`/products/edit/${p.id}`); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
                        <Button variant="dangerOutline" size="sm" onClick={() => handleDelete(p.id, p.name)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete</Button>
                      </div>
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
            label="products"
          />
        )}
      </div>
    </div>
  );
}
