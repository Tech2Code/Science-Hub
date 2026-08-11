"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import { formatDate } from "@/lib/formatDate";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { RateListPrintArea } from "@/components/rateLists/RateListPrintArea";
import styles from "./rateListsList.module.css";

interface RateListSummary {
  id: string;
  title: string;
  note: string | null;
  createdAt: string;
  createdBy: { name: string };
  _count: { items: number };
}

interface RateListListResponse {
  data: RateListSummary[];
  total: number;
}

interface RateListItem {
  id: string; name: string; brand: string | null; unit: string;
  isNetRate: boolean; discountPercent: number; listRate: number; amount: number;
}
interface RateListDetail {
  id: string; title: string; note: string | null; createdAt: string; items: RateListItem[];
}
interface BusinessSettings {
  name?: string; address?: string; city?: string; state?: string; pincode?: string;
  phone?: string; email?: string; gstin?: string; logoUrl?: string; showLogoOnInvoices?: boolean;
}

type SortOption = "newest" | "oldest" | "title_az" | "title_za";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",   label: "Newest first" },
  { value: "oldest",   label: "Oldest first" },
  { value: "title_az", label: "Title (A–Z)" },
  { value: "title_za", label: "Title (Z–A)" },
];

const COLUMNS: Column[] = [
  { label: "Title",     mobile: "full+label" },
  { label: "Items",     cls: "table-th-right", mobile: "label" },
  { label: "Created",   mobile: "label" },
  { label: "Created By", mobile: "label" },
  { label: "Actions",   mobile: "full+label" },
];

export default function RateListsPage() {
  const canWrite = useCanWrite();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RateListSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const router = useRouter();

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = showAll ? 2000 : PAGE_SIZE;

  const listParams = new URLSearchParams();
  if (debouncedSearch.trim()) listParams.set("search", debouncedSearch.trim());
  listParams.set("sort", sort);
  listParams.set("page", String(page));
  listParams.set("pageSize", String(pageSize));
  const apiUrl = `/api/rate-lists?${listParams.toString()}`;

  const { data, loading, mutate } = useFetch<RateListListResponse>(apiUrl);
  const rateLists = data?.data ?? [];
  const total = data?.total ?? 0;

  const { data: settings } = useFetch<BusinessSettings>("/api/settings");
  const [previewTarget, setPreviewTarget] = useState<RateListDetail | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState("");

  async function handlePreview(rl: RateListSummary) {
    setPreviewLoadingId(rl.id);
    try {
      const res = await fetch(`/api/rate-lists/${rl.id}`);
      const detail: RateListDetail & { error?: string } = await res.json();
      if (!res.ok || detail.error) {
        toast({ type: "error", title: "Failed", message: detail.error ?? "Could not load rate list." });
        return;
      }
      setPreviewTarget(detail);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;
      const el = document.getElementById("rate-list-print-area");
      const showLogo = settings?.showLogoOnInvoices !== false;
      const blob = el ? await generateInvoicePdfBlob(el, { logoUrl: showLogo ? settings?.logoUrl || undefined : undefined }) : null;
      if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
      setPdfPreviewTitle(detail.title);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast({ type: "error", title: "Failed", message: "Network error." });
    } finally {
      setPreviewLoadingId(null);
      setPreviewTarget(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rate-lists/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await mutate();
        toast({ type: "success", title: "Deleted", message: `"${target.title}" was deleted.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete rate list." });
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
    {previewLoadingId && <OverlayLoader text="Generating preview…" />}
    {previewTarget && <RateListPrintArea rateList={previewTarget} settings={settings ?? null} />}
    {pdfPreviewUrl && (
      <PdfPreviewModal
        url={pdfPreviewUrl}
        fileName={pdfPreviewTitle || "rate-list"}
        title={pdfPreviewTitle || "Rate List Preview"}
        onClose={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
      />
    )}
    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete Rate List"
      message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => setDeleteTarget(null)}
    />

    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rate Lists</h1>
          <p className="page-sub">
            {loading ? "Loading…" : `${total} rate list${total === 1 ? "" : "s"}`}
          </p>
        </div>
        {canWrite && (<Button variant="primary" href="/sales/rate-lists/new">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Rate List
        </Button>)}
      </div>

      <div {...animateSection(0, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search rate lists"
              placeholder="Search by title…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className={styles.searchInput}
            />
            <SortSelect ariaLabel="Sort rate lists" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
          </div>
          {!loading && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll(v => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={COLUMNS} />
              ) : rateLists.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search.trim() ? `No rate lists match "${search}".` : "No rate lists yet. Create your first one."}
                </td></tr>
              ) : rateLists.map(rl => (
                <tr key={rl.id}>
                  <Cell col={COLUMNS[0]}>
                    <Link href={`/sales/rate-lists/${rl.id}`} className={`${styles.titleCell} table-link`} title={rl.title}>{rl.title}</Link>
                    {rl.note && <div className={styles.noteSub} title={rl.note}>{rl.note}</div>}
                  </Cell>
                  <Cell col={COLUMNS[1]} className={styles.countCell}>{rl._count.items}</Cell>
                  <Cell col={COLUMNS[2]} className={styles.mutedCell}>{formatDate(rl.createdAt)}</Cell>
                  <Cell col={COLUMNS[3]} className={styles.mutedCell}>{rl.createdBy?.name ?? "—"}</Cell>
                  <Cell col={COLUMNS[4]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" href={`/sales/rate-lists/${rl.id}`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </Button>
                      <Button variant="secondary" size="sm" loading={previewLoadingId === rl.id} onClick={() => handlePreview(rl)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Preview
                      </Button>
                      {canWrite && (<Button variant="editOutline" size="sm" onClick={() => { setOpeningEditId(rl.id); router.push(`/sales/rate-lists/${rl.id}/edit`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </Button>)}
                      {canWrite && (<Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(rl)}>
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
        {!loading && total > 0 && (
          <Pagination total={total} page={page} showAll={showAll} onPage={setPage} label="rate lists" />
        )}
      </div>
    </div>
    </>
  );
}
