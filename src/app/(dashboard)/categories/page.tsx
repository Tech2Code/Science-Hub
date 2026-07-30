"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { useFetch, bustCachePrefix } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import { rules, validate } from "@/lib/validation";
import styles from "./categories.module.css";

interface Category {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  _count: { products: number };
}

interface CategoryListResponse {
  data: Category[];
  total: number;
}

type SortOption = "name_az" | "name_za" | "products_high" | "products_low" | "newest" | "oldest";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",        label: "Newest first" },
  { value: "oldest",        label: "Oldest first" },
  { value: "name_az",       label: "Name (A–Z)" },
  { value: "name_za",       label: "Name (Z–A)" },
  { value: "products_high", label: "Products (High–Low)" },
  { value: "products_low",  label: "Products (Low–High)" },
];

const COLUMNS: Column[] = [
  { label: "#",             mobile: "hide" },
  { label: "Category Name", mobile: "full+label" },
  { label: "Products",      cls: "table-th-right", mobile: "full+label" },
  { label: "Actions",       mobile: "full+label" },
];

export default function CategoriesPage() {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingOriginalName, setEditingOriginalName] = useState("");
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
  const [openingView, setOpeningView] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = showAll ? 5000 : PAGE_SIZE;

  const listParams = new URLSearchParams();
  if (debouncedSearch.trim()) listParams.set("search", debouncedSearch.trim());
  listParams.set("sort", sort);
  listParams.set("page", String(page));
  listParams.set("pageSize", String(pageSize));
  const apiUrl = `/api/categories?${listParams.toString()}`;

  const { data, loading, mutate } = useFetch<CategoryListResponse>(apiUrl);
  const categories = data?.data ?? [];
  const total = data?.total ?? 0;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (validate(name, rules.required("Category name is required."))) return;
    setSaving(true);
    const r = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNewName("");
      setAddOpen(false);
      await mutate();
      toast({ type: "success", title: "Category added", message: `"${name}" added to catalog.` });
    } else {
      const d = await r.json();
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to add category" });
    }
    setSaving(false);
  }

  function startRename(cat: Category) {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setEditingOriginalName(cat.name);
    setEditingUpdatedAt(cat.updatedAt);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const id = editingId;
    const name = editingName.trim();
    if (!id) return;
    if (validate(name, rules.required("Category name is required."))) return;
    setRenaming(true);
    const r = await fetch(`/api/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, expectedUpdatedAt: editingUpdatedAt }),
    });
    const d = await r.json().catch(() => ({}));
    setRenaming(false);
    if (r.ok) {
      setEditingId(null);
      await mutate();
      toast({ type: "success", title: "Category renamed", message: `Renamed to "${name}".` });
      router.push(`/categories/${id}`);
    } else if (r.status === 409) {
      bustCachePrefix("/api/categories");
      toast({ type: "error", title: "Update conflict", message: d.error ?? "This category was changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Rename failed", message: d.error ?? "Could not rename category." });
    }
  }

  function handleDelete(id: string, name: string) {
    setConfirmState({
      title: "Delete Category",
      message: `Move "${name}" to bin?`,
      onConfirm: async () => {
        setDeleting(true);
        const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
        const d = await res.json().catch(() => ({}));
        setDeleting(false);
        setConfirmState(null);
        if (res.ok) {
          await mutate();
          toast({ type: "success", title: "Category deleted", message: `"${name}" moved to bin.` });
        } else {
          toast({ type: "error", title: "Cannot delete category", message: d.error ?? "Could not delete category." });
        }
      },
    });
  }

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  return (
    <>
    {(saving || renaming) && <OverlayLoader text={renaming ? "Renaming…" : "Adding…"} />}
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
          <h1 className="page-title">Categories</h1>
          <p className="page-sub">{loading ? "Loading…" : `${total} categories in catalog`}</p>
        </div>
        {canWrite && (
          <Button variant="primary" onClick={() => { setNewName(""); setAddOpen(true); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Category
          </Button>
        )}
      </div>

      {canWrite && (
        <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add New Category">
          <form onSubmit={handleAdd} className={styles.addForm} noValidate>
            <Input
              ref={inputRef}
              type="text"
              autoFocus
              placeholder="Category name (e.g. Lab Glassware, Instruments…)"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); }}
              className={`${styles.addInput}`}
            />
            <Button type="submit" variant="primary" disabled={!newName.trim() || saving}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Category
            </Button>
          </form>
        </Modal>
      )}

      {canWrite && (
        <Modal open={!!editingId} onClose={() => setEditingId(null)} title="Rename Category">
          <form onSubmit={handleRename} className={styles.addForm} noValidate>
            <Input
              type="text"
              autoFocus
              placeholder="Category name"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className={`${styles.addInput}`}
            />
            <Button type="submit" variant="primary" disabled={!editingName.trim() || editingName.trim() === editingOriginalName || renaming}>Save</Button>
          </form>
        </Modal>
      )}

      {/* Categories list */}
      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search categories"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort categories" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
          {!loading && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
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
                <TableSkeleton columns={COLUMNS} />
              ) : categories.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search ? "No categories match your search." : "No categories yet. Add one above."}
                </td></tr>
              ) : categories.map((c, i) => (
                <tr key={c.id}>
                  <Cell col={COLUMNS[0]} className={styles.indexCell}>{i + 1}</Cell>
                  <Cell col={COLUMNS[1]}>
                    <Link href={`/categories/${c.id}`} onClick={() => setOpeningView(true)} className={`${styles.nameCell} table-link`} title={c.name}>{c.name}</Link>
                  </Cell>
                  <Cell col={COLUMNS[2]}>
                    <span className={`${styles.productsBadge} ${c._count.products > 0 ? styles.productsBadgeActive : ""}`}>
                      {c._count.products} {c._count.products === 1 ? "product" : "products"}
                    </span>
                  </Cell>
                  <Cell col={COLUMNS[3]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" onClick={() => { setOpeningView(true); router.push(`/categories/${c.id}`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View
                      </Button>
                      {canWrite && (<Button variant="editOutline" size="sm" onClick={() => startRename(c)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Rename
                      </Button>)}
                      {canWrite && (<Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => handleDelete(c.id, c.name)}
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
        {!loading && total > 0 && (
          <Pagination
            total={total}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="categories"
          />
        )}
      </div>
    </div>
    </>
  );
}
