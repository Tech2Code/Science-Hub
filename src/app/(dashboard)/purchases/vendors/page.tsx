"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import styles from "./vendorsList.module.css";

interface Vendor {
  id: string;
  name: string;
  company: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt?: string;
  _count: { purchaseBills: number };
}

type SortOption = "name_az" | "name_za" | "bills_high" | "bills_low" | "newest" | "oldest";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",     label: "Newest first" },
  { value: "oldest",     label: "Oldest first" },
  { value: "name_az",    label: "Name (A–Z)" },
  { value: "name_za",    label: "Name (Z–A)" },
  { value: "bills_high", label: "Bills (High–Low)" },
  { value: "bills_low",  label: "Bills (Low–High)" },
];

function sortVendors(list: Vendor[], sort: SortOption): Vendor[] {
  const arr = [...list];
  switch (sort) {
    case "name_za":    return arr.sort((a, b) => b.name.localeCompare(a.name));
    case "bills_high": return arr.sort((a, b) => b._count.purchaseBills - a._count.purchaseBills);
    case "bills_low":  return arr.sort((a, b) => a._count.purchaseBills - b._count.purchaseBills);
    case "oldest":     return arr.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    case "newest":     return arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    case "name_az":
    default:           return arr.sort((a, b) => a.name.localeCompare(b.name));
  }
}

const COLUMNS: Column[] = [
  { label: "Vendor",  mobile: "full+label" },
  { label: "GSTIN",   mobile: "label" },
  { label: "Phone",   mobile: "label" },
  { label: "Email",   mobile: "label" },
  { label: "Bills",   cls: "table-th-right", mobile: "label" },
  { label: "Status",  mobile: "label" },
  { label: "Actions", mobile: "full+label" },
];

export default function VendorsPage() {
  const canWrite = useCanWrite();
  const { data, loading, patchData } = useFetch<Vendor[]>("/api/vendors");
  const vendors = data ?? [];
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const router = useRouter();

  const filtered = search.trim()
    ? vendors.filter(v => {
        const q = search.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          (v.company ?? "").toLowerCase().includes(q) ||
          (v.gstin ?? "").toLowerCase().includes(q) ||
          (v.phone ?? "").includes(q) ||
          (v.email ?? "").toLowerCase().includes(q)
        );
      })
    : vendors;

  const sorted = sortVendors(filtered, sort);
  const maxPage = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, maxPage);
  const { visible } = usePagination(sorted, clampedPage, showAll);

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        patchData((prev) => (prev ?? []).filter((v) => v.id !== target.id));
        toast({ type: "success", title: "Vendor deleted", message: `"${target.name}" removed.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete vendor." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
    {openingEditId && <OverlayLoader text="Opening editor…" />}
    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete Vendor"
      message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => setDeleteTarget(null)}
    />

    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-sub">
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${vendors.length} vendors` : `${vendors.length} vendors`}
          </p>
        </div>
        {canWrite && (<Button variant="primary" href="/purchases/vendors/new">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Vendor
        </Button>)}
      </div>

      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search vendors"
              placeholder="Search by name, company, GSTIN, phone or email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className={`${styles.searchInput}`}
            />
            <SortSelect ariaLabel="Sort vendors" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll(v => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={COLUMNS.length} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search.trim() ? `No vendors match "${search}".` : "No vendors yet. Add your first vendor."}
                </td></tr>
              ) : visible.map(v => (
                <tr key={v.id}>
                  <Cell col={COLUMNS[0]}>
                    <Link href={`/purchases/vendors/${v.id}`} className={`${styles.nameCell} table-link`} title={v.name}>{v.name}</Link>
                    {v.company && <div className={styles.companySub} title={v.company}>{v.company}</div>}
                  </Cell>
                  <Cell col={COLUMNS[1]} className={styles.gstinCell}>
                    {v.gstin || <span className={styles.emptyValue}>—</span>}
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.mutedCell}>
                    {v.phone || <span className={styles.emptyValue}>—</span>}
                  </Cell>
                  <Cell col={COLUMNS[3]} className={styles.mutedCell}>
                    {v.email || <span className={styles.emptyValue}>—</span>}
                  </Cell>
                  <Cell col={COLUMNS[4]} className={styles.countCell}>{v._count.purchaseBills}</Cell>
                  <Cell col={COLUMNS[5]}>
                    <span className={`${styles.statusBadge} ${v.isActive ? styles.statusActive : styles.statusInactive}`}>
                      {v.isActive ? "Active" : "Inactive"}
                    </span>
                  </Cell>
                  <Cell col={COLUMNS[6]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" href={`/purchases/vendors/${v.id}`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </Button>
                      {canWrite && (<Button variant="editOutline" size="sm" onClick={() => { setOpeningEditId(v.id); router.push(`/purchases/vendors/${v.id}/edit`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </Button>)}
                      {canWrite && (<Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(v)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                        Delete
                      </Button>)}
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination total={filtered.length} page={clampedPage} showAll={showAll} onPage={setPage} label="vendors" />
        )}
      </div>
    </div>
    </>
  );
}
