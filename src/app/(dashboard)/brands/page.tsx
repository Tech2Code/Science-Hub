"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import styles from "./brands.module.css";

interface Brand {
  id: string;
  name: string;
  createdAt?: string;
  _count: { products: number };
  createdBy?: string | null;
}

type SortOption = "name_az" | "name_za" | "products_high" | "products_low" | "newest" | "oldest";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name_az",       label: "Name (A–Z)" },
  { value: "name_za",       label: "Name (Z–A)" },
  { value: "products_high", label: "Products (High–Low)" },
  { value: "products_low",  label: "Products (Low–High)" },
  { value: "newest",        label: "Newest first" },
  { value: "oldest",        label: "Oldest first" },
];

function sortBrands(list: Brand[], sort: SortOption): Brand[] {
  const arr = [...list];
  switch (sort) {
    case "name_za":       return arr.sort((a, b) => b.name.localeCompare(a.name));
    case "products_high": return arr.sort((a, b) => b._count.products - a._count.products);
    case "products_low":  return arr.sort((a, b) => a._count.products - b._count.products);
    case "oldest":        return arr.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    case "newest":        return arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    case "name_az":
    default:              return arr.sort((a, b) => a.name.localeCompare(b.name));
  }
}

const COLUMNS: Column[] = [
  { label: "#",          mobile: "hide" },
  { label: "Brand Name", mobile: "full+label" },
  { label: "Created By", mobile: "label" },
  { label: "Created At", mobile: "label" },
  { label: "Products",   cls: "table-th-right", mobile: "full+label" },
  { label: "Actions",    mobile: "full+label" },
];

export default function BrandsPage() {
  const canWrite = useCanWrite();
  const router = useRouter();
  const { data, loading, patchData } = useFetch<Brand[]>("/api/brands");
  const brands = data ?? [];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingView, setOpeningView] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const r = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const created = await r.json();
      setNewName("");
      // The create response already has the full record — merge it straight
      // into the list instead of waiting on a full refetch.
      patchData((prev) => [...(prev ?? []), created]);
      toast({ type: "success", title: "Brand added", message: `"${name}" added to catalog.` });
    } else {
      const d = await r.json();
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to add brand" });
    }
    setSaving(false);
  }

  function handleDelete(id: string, name: string) {
    setConfirmState({
      title: "Delete Brand",
      message: `Move "${name}" to bin?`,
      onConfirm: async () => {
        setDeleting(true);
        const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
        const d = await res.json().catch(() => ({}));
        setDeleting(false);
        setConfirmState(null);
        if (res.ok) {
          patchData((prev) => (prev ?? []).filter((b) => b.id !== id));
          toast({ type: "success", title: "Brand deleted", message: `"${name}" moved to bin.` });
        } else {
          toast({ type: "error", title: "Cannot delete brand", message: d.error ?? "Could not delete brand." });
        }
      },
    });
  }

  const filtered = brands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = sortBrands(filtered, sort);
  const { visible } = usePagination(sorted, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamps page back into range after a delete shrinks the list
    if (page > totalPages) setPage(totalPages);
  }, [sorted.length, page]);

  return (
    <>
    {saving && <OverlayLoader text="Adding…" />}
    {openingView && <OverlayLoader text="Opening…" />}
    <div className="page-stack">
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmState(null)}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Brands</h1>
          <p className="page-sub">{loading ? "Loading…" : `${brands.length} brands in catalog`}</p>
        </div>
      </div>

      {/* Add brand form */}
      {canWrite && (<div {...animateSection(0, `card ${styles.addCard}`)}>
        <h2 className={styles.addCardTitle}>
          Add New Brand
        </h2>
        <form onSubmit={handleAdd} className={styles.addForm}>
          <Input
            ref={inputRef}
            type="text"
            placeholder="Brand name (e.g. Merck, Borosil…)"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); }}
            className={`${styles.addInput}`}
          />
          <Button type="submit" variant="primary" disabled={!newName.trim() || saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Brand
          </Button>
        </form>
      </div>)}

      {/* Brands list */}
      <div {...animateSection(1, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search brands"
              placeholder="Search brands…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort brands" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
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
                  {search ? "No brands match your search." : "No brands yet. Add one above."}
                </td></tr>
              ) : visible.map((b, i) => (
                <tr key={b.id}>
                  <Cell col={COLUMNS[0]} className={styles.indexCell}>{i + 1}</Cell>
                  <Cell col={COLUMNS[1]}>
                    <Link href={`/brands/${b.id}`} onClick={() => setOpeningView(true)} className={`${styles.nameCell} table-link`} title={b.name}>{b.name}</Link>
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.mutedCell}>{b.createdBy ?? "—"}</Cell>
                  <Cell col={COLUMNS[3]} className={styles.mutedCell}>
                    {b.createdAt ? new Date(b.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                  </Cell>
                  <Cell col={COLUMNS[4]}>
                    <span className={`${styles.productsBadge} ${b._count.products > 0 ? styles.productsBadgeActive : ""}`}>
                      {b._count.products} {b._count.products === 1 ? "product" : "products"}
                    </span>
                  </Cell>
                  <Cell col={COLUMNS[5]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" onClick={() => { setOpeningView(true); router.push(`/brands/${b.id}`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View
                      </Button>
                      {canWrite && (<Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => handleDelete(b.id, b.name)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete
                      </Button>)}
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
            label="brands"
          />
        )}
      </div>
    </div>
    </>
  );
}
