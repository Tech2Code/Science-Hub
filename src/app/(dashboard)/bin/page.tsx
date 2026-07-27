"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import { Cell, type Column } from "@/components/ui/Table";
import styles from "./bin.module.css";

type BinType = "invoice" | "customer" | "product" | "brand" | "category" | "vendor" | "purchase_bill" | "return";

interface BinItem {
  id: string;
  type: BinType;
  name: string;
  meta: string;
  deletedAt: string;
  daysLeft: number;
  deletedBy?: string;
  protectedReason?: string;
}

const TYPE_META: Record<BinType, { plural: string; pillCls: string }> = {
  invoice:       { plural: "Invoices",      pillCls: styles.typePillInvoice },
  customer:      { plural: "Customers",     pillCls: styles.typePillCustomer },
  product:       { plural: "Products",      pillCls: styles.typePillProduct },
  brand:         { plural: "Brands",        pillCls: styles.typePillBrand },
  category:      { plural: "Categories",    pillCls: styles.typePillCategory },
  vendor:        { plural: "Vendors",       pillCls: styles.typePillVendor },
  purchase_bill: { plural: "Purchase Bills", pillCls: styles.typePillPurchaseBill },
  return:        { plural: "Credit Notes",  pillCls: styles.typePillReturn },
};

const TYPE_ORDER: BinType[] = ["invoice", "customer", "product", "brand", "category", "vendor", "purchase_bill", "return"];

function DaysLeftPill({ daysLeft }: { daysLeft: number }) {
  const red    = daysLeft <= 7;
  const yellow = !red && daysLeft <= 14;
  const toneCls = red ? styles.daysLeftRed : yellow ? styles.daysLeftYellow : styles.daysLeftGreen;
  return (
    <span className={`${styles.daysLeftPill} ${toneCls}`}>
      {daysLeft === 0 ? "Expiring soon" : `${daysLeft}d left`}
    </span>
  );
}

const BIN_COLUMNS: Column[] = [
  { label: "Name",       mobile: "full+label" },
  { label: "Details",    mobile: "label" },
  { label: "Deleted On", mobile: "label" },
  { label: "Deleted By", mobile: "label" },
  { label: "Expires",    mobile: "label" },
  { label: "Actions",    mobile: "full+label" },
];

function TypeSection({
  type, items, index, onRestore, onDeleteForever,
}: {
  type: BinType;
  items: BinItem[];
  index: number;
  onRestore: (item: BinItem) => void;
  onDeleteForever: (item: BinItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const m = TYPE_META[type];
  if (items.length === 0) return null;

  return (
    <div {...animateSection(index, `card ${styles.sectionCard}`)}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`${styles.sectionToggle} ${open ? styles.sectionToggleOpen : ""}`}
      >
        <span className={`${styles.typePill} ${m.pillCls}`}>
          {m.plural}
        </span>
        <span className={styles.itemCount}>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="table-wrap">
          <table className={`table-base ${styles.binTable}`}>
            <colgroup>
              <col className={styles.colName} />
              <col className={styles.colDetails} />
              <col className={styles.colDeletedOn} />
              <col className={styles.colDeletedBy} />
              <col className={styles.colExpires} />
              <col className={styles.colActions} />
            </colgroup>
            <thead>
              <tr>
                {BIN_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Cell col={BIN_COLUMNS[0]} className={[styles.nameCell, item.protectedReason ? styles.nameCellProtected : ""].join(" ")}>
                    {item.name}
                    {item.protectedReason && (
                      <span className={styles.protectedBadge} title={item.protectedReason}>Protected</span>
                    )}
                  </Cell>
                  <Cell col={BIN_COLUMNS[1]} className={styles.detailsCell}>
                    {item.meta || <span className={styles.emptyValue}>—</span>}
                  </Cell>
                  <Cell col={BIN_COLUMNS[2]} className={styles.mutedCell}>
                    {new Date(item.deletedAt).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </Cell>
                  <Cell col={BIN_COLUMNS[3]} className={styles.mutedCell}>
                    {item.deletedBy ?? <span className={styles.emptyValue}>—</span>}
                  </Cell>
                  <Cell col={BIN_COLUMNS[4]}>
                    <DaysLeftPill daysLeft={item.daysLeft} />
                  </Cell>
                  <Cell col={BIN_COLUMNS[5]}>
                    <div className="table-actions">
                      <Button variant="editOutline" size="sm" onClick={() => onRestore(item)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>Restore</Button>
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        disabled={!!item.protectedReason}
                        title={item.protectedReason}
                        onClick={() => onDeleteForever(item)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>Delete Forever
                      </Button>
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_BIN_PHRASE = "DELETE ALL";

export default function BinPage() {
  const { data, loading, mutate } = useFetch<BinItem[]>("/api/bin");
  const items = useMemo(() => data ?? [], [data]);
  const toast = useToast();
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);

  const [search, setSearch] = useState("");
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; confirmLabel: string; variant: "default" | "danger";
    onConfirm: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [emptyBinOpen, setEmptyBinOpen] = useState(false);
  const [emptyBinInput, setEmptyBinInput] = useState("");
  const [emptyBinLoading, setEmptyBinLoading] = useState(false);

  function handleRestore(item: BinItem) {
    setConfirmState({
      title: "Restore Item",
      message: `Restore "${item.name}"? It will be moved back to its original section.`,
      confirmLabel: "Restore",
      variant: "default",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/bin/${item.type}/${item.id}`, { method: "POST" });
          const d = await res.json().catch(() => ({}));
          setConfirmLoading(false);
          setConfirmState(null);
          if (res.ok) {
            mutate();
            toast({ type: "success", title: "Restored", message: `"${item.name}" restored successfully.` });
          } else {
            toast({ type: "error", title: "Restore failed", message: d.error ?? "Could not restore item." });
          }
        } catch {
          setConfirmLoading(false);
          setConfirmState(null);
          toast({ type: "error", title: "Restore failed", message: "Network error." });
        }
      },
    });
  }

  function handleDeleteForever(item: BinItem) {
    setConfirmState({
      title: "Delete Forever",
      message: `Permanently delete "${item.name}"? This cannot be undone.`,
      confirmLabel: "Delete Forever",
      variant: "danger",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/bin/${item.type}/${item.id}`, { method: "DELETE" });
          const d = await res.json().catch(() => ({}));
          setConfirmLoading(false);
          setConfirmState(null);
          if (res.ok) {
            mutate();
            toast({ type: "success", title: "Permanently deleted", message: `"${item.name}" has been permanently deleted.` });
          } else {
            toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not permanently delete item." });
          }
        } catch {
          setConfirmLoading(false);
          setConfirmState(null);
          toast({ type: "error", title: "Delete failed", message: "Network error." });
        }
      },
    });
  }

  function handleEmptyBin() {
    setEmptyBinInput("");
    setEmptyBinOpen(true);
  }

  async function confirmEmptyBin() {
    if (emptyBinInput !== EMPTY_BIN_PHRASE) return;
    setEmptyBinLoading(true);
    try {
      const res = await fetch("/api/bin/empty", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      setEmptyBinLoading(false);
      setEmptyBinOpen(false);
      if (res.ok) {
        mutate();
        toast({
          type: "success",
          title: "Bin emptied",
          message: `${d.deleted ?? 0} item(s) permanently deleted${d.skipped ? `, ${d.skipped} skipped (still referenced elsewhere).` : "."}`,
        });
      } else {
        toast({ type: "error", title: "Failed", message: d.error ?? "Could not empty bin." });
      }
    } catch {
      setEmptyBinLoading(false);
      setEmptyBinOpen(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
  }

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter(item => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        (item.deletedBy ?? "").toLowerCase().includes(q) ||
        new Date(item.deletedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const grouped = TYPE_ORDER.reduce((acc, t) => {
    acc[t] = filteredItems.filter(i => i.type === t);
    return acc;
  }, {} as Record<BinType, BinItem[]>);

  const totalCount = items.length;
  const filteredCount = filteredItems.length;

  return (
    <>
    <div className="page-stack">
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
        variant={confirmState?.variant ?? "default"}
        loading={confirmLoading}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onCancel={() => { if (!confirmLoading) setConfirmState(null); }}
      />

      <ConfirmDialog
        open={emptyBinOpen}
        title="Empty Recycle Bin"
        message={`Permanently delete all ${items.length} item(s) currently in the bin? This cannot be undone.`}
        confirmLabel="Empty Bin"
        variant="danger"
        loading={emptyBinLoading}
        confirmDisabled={emptyBinInput !== EMPTY_BIN_PHRASE}
        detail={
          <div className={styles.typeToConfirm}>
            <label htmlFor="empty-bin-confirm">
              Type <strong>{EMPTY_BIN_PHRASE}</strong> to confirm
            </label>
            <Input
              id="empty-bin-confirm"
              type="text"
              autoComplete="off"
              autoFocus
              className=""
              value={emptyBinInput}
              onChange={(e) => setEmptyBinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && emptyBinInput === EMPTY_BIN_PHRASE) confirmEmptyBin(); }}
            />
          </div>
        }
        onConfirm={confirmEmptyBin}
        onCancel={() => { if (!emptyBinLoading) setEmptyBinOpen(false); }}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Recycle Bin</h1>
          <p className="page-sub">
            {loading
              ? "Loading…"
              : totalCount === 0
              ? "Bin is empty"
              : search.trim()
              ? `${filteredCount} of ${totalCount} items`
              : `${totalCount} item${totalCount !== 1 ? "s" : ""} — auto-purged after 30 days`}
          </p>
        </div>
        {isAdmin && !loading && totalCount > 0 && (
          <Button variant="dangerOutline" size="sm" onClick={handleEmptyBin}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            Empty Recycle Bin
          </Button>
        )}
      </div>

      {!loading && totalCount > 0 && (
        <div {...animateSection(0, `card ${styles.searchCard}`)}>
          <Input
            type="search"
            aria-label="Search bin"
            placeholder="Search by name, invoice no., customer, phone, amount, deleted by, date…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${styles.searchInputFull}`}
          />
        </div>
      )}

      {loading ? (
        <div {...animateSection(0, "card")}>
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Name</th><th>Details</th><th>Deleted On</th><th>Deleted By</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody><TableSkeleton cols={6} /></tbody>
            </table>
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div {...animateSection(0, `card ${styles.emptyState}`)}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={styles.emptyStateIcon}>
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Bin is empty — nothing has been deleted recently.
        </div>
      ) : search.trim() && filteredCount === 0 ? (
        <div {...animateSection(1, `card ${styles.emptyState}`)}>
          No items match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        TYPE_ORDER.map((type, i) => (
          <TypeSection
            key={type}
            type={type}
            items={grouped[type]}
            index={i + 1}
            onRestore={handleRestore}
            onDeleteForever={handleDeleteForever}
          />
        ))
      )}
    </div>
    </>
  );
}
