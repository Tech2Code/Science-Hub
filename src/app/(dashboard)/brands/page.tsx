"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input, FormField } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { rules, validate } from "@/lib/validation";
import { useFetch, bustCachePrefix } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import styles from "./brands.module.css";

interface Brand {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  _count: { products: number };
  createdBy?: string | null;
}

interface BrandListResponse {
  data: Brand[];
  total: number;
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

const COLUMNS: Column[] = [
  { label: "#",          mobile: "hide" },
  { label: "Brand Name", mobile: "full+label" },
  { label: "Products",   cls: "table-th-right", mobile: "full+label" },
  { label: "Actions",    mobile: "full+label" },
];

export default function BrandsPage() {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingView, setOpeningView] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [addNameError, setAddNameError] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renameNameError, setRenameNameError] = useState<string | undefined>(undefined);
  const [editingOriginalName, setEditingOriginalName] = useState("");
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
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
  const apiUrl = `/api/brands?${listParams.toString()}`;

  const { data, loading, mutate } = useFetch<BrandListResponse>(apiUrl);
  const brands = data?.data ?? [];
  const total = data?.total ?? 0;
  const showSkeleton = loading && !data;
  const isRefetching = loading && !!data;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const err = validate(name, rules.required("Brand name is required."), rules.minLength(2), rules.maxLength(200));
    if (err) { setAddNameError(err); return; }
    setAddNameError(undefined);
    setSaving(true);
    const r = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNewName("");
      setAddOpen(false);
      await mutate();
      toast({ type: "success", title: "Brand added", message: `"${name}" added to catalog.` });
    } else {
      const d = await r.json();
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to add brand" });
    }
    setSaving(false);
  }

  function startRename(brand: Brand) {
    setEditingId(brand.id);
    setEditingName(brand.name);
    setEditingOriginalName(brand.name);
    setEditingUpdatedAt(brand.updatedAt);
    setRenameNameError(undefined);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const id = editingId;
    const name = editingName.trim();
    if (!id) return;
    const err = validate(name, rules.required("Brand name is required."), rules.minLength(2), rules.maxLength(200));
    if (err) { setRenameNameError(err); return; }
    setRenameNameError(undefined);
    setRenaming(true);
    const r = await fetch(`/api/brands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, expectedUpdatedAt: editingUpdatedAt }),
    });
    const d = await r.json().catch(() => ({}));
    setRenaming(false);
    if (r.ok) {
      setEditingId(null);
      await mutate();
      // Product list/detail embed the brand's name, so a rename leaves them stale until this bust.
      bustCachePrefix("/api/products");
      toast({ type: "success", title: "Brand renamed", message: `Renamed to "${name}".` });
    } else if (r.status === 409) {
      bustCachePrefix("/api/brands");
      toast({ type: "error", title: "Update conflict", message: d.error ?? "This brand was changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Rename failed", message: d.error ?? "Could not rename brand." });
    }
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
          await mutate();
          toast({ type: "success", title: "Brand deleted", message: `"${name}" moved to bin.` });
        } else {
          toast({ type: "error", title: "Cannot delete brand", message: d.error ?? "Could not delete brand." });
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
          <h1 className="page-title">Brands</h1>
          <p className="page-sub">{loading ? "Loading…" : `${total} brands in catalog`}</p>
        </div>
        {canWrite && (
          <Button variant="primary" onClick={() => { setNewName(""); setAddNameError(undefined); setAddOpen(true); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Brand
          </Button>
        )}
      </div>

      {canWrite && (
        <Modal
          open={addOpen}
          onClose={() => { if (!saving) setAddOpen(false); }}
          title="Add New Brand"
          variant="fullscreen"
          footer={
            <>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" form="add-brand-form" variant="primary" disabled={saving}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Brand
              </Button>
            </>
          }
        >
          <form id="add-brand-form" onSubmit={handleAdd} className={styles.addForm} noValidate>
            <FormField label="Brand Name" required error={addNameError}>
              <Input
                ref={inputRef}
                type="text"
                autoFocus
                placeholder="Brand name (e.g. Merck, Borosil…)"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setAddNameError(undefined); }}
                className={`${styles.addInput}`}
                maxLength={200}
              />
            </FormField>
          </form>
        </Modal>
      )}

      {canWrite && (
        <Modal
          open={!!editingId}
          onClose={() => { if (!renaming) setEditingId(null); }}
          title="Rename Brand"
          variant="fullscreen"
          footer={
            <>
              <Button type="button" variant="secondary" disabled={renaming} onClick={() => setEditingId(null)}>Cancel</Button>
              <Button type="submit" form="rename-brand-form" variant="primary" disabled={renaming || editingName.trim() === editingOriginalName}>Save</Button>
            </>
          }
        >
          <form id="rename-brand-form" onSubmit={handleRename} className={styles.addForm} noValidate>
            <FormField label="Brand Name" required error={renameNameError}>
              <Input
                type="text"
                autoFocus
                placeholder="Brand name"
                value={editingName}
                onChange={(e) => { setEditingName(e.target.value); setRenameNameError(undefined); }}
                className={`${styles.addInput}`}
                maxLength={200}
              />
            </FormField>
          </form>
        </Modal>
      )}

      {/* Brands list */}
      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <SearchField
              aria-label="Search brands"
              placeholder="Search brands…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort brands" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
          {data && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base" style={isRefetching ? { opacity: 0.5, transition: "opacity 0.15s" } : undefined}>
            <thead>
              <tr>
                {COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {showSkeleton ? (
                <TableSkeleton columns={COLUMNS} />
              ) : brands.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search ? "No brands match your search." : "No brands yet. Add one above."}
                </td></tr>
              ) : brands.map((b, i) => (
                <tr key={b.id}>
                  <Cell col={COLUMNS[0]} className={styles.indexCell}>{i + 1}</Cell>
                  <Cell col={COLUMNS[1]}>
                    <Link href={`/brands/${b.id}`} onClick={() => setOpeningView(true)} className={`${styles.nameCell} table-link`} title={b.name}>{b.name}</Link>
                  </Cell>
                  <Cell col={COLUMNS[2]}>
                    <span className={`${styles.productsBadge} ${b._count.products > 0 ? styles.productsBadgeActive : ""}`}>
                      {b._count.products} {b._count.products === 1 ? "product" : "products"}
                    </span>
                  </Cell>
                  <Cell col={COLUMNS[3]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" onClick={() => { setOpeningView(true); router.push(`/brands/${b.id}`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View
                      </Button>
                      {canWrite && (<Button variant="editOutline" size="sm" onClick={() => startRename(b)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Rename
                      </Button>)}
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
        {data && total > 0 && (
          <Pagination
            total={total}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="brands"
            loading={isRefetching}
          />
        )}
      </div>
    </div>
    </>
  );
}
