"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";

type BinType = "invoice" | "customer" | "product" | "brand" | "category";

interface BinItem {
  id: string;
  type: BinType;
  name: string;
  meta: string;
  deletedAt: string;
  daysLeft: number;
  deletedBy?: string;
}

const TYPE_META: Record<BinType, { plural: string; color: string; bg: string; border: string }> = {
  invoice:  { plural: "Invoices",   color: "var(--c-blue)",       bg: "var(--c-blue-bg)",  border: "var(--c-blue-border, #bfdbfe)"  },
  customer: { plural: "Customers",  color: "var(--c-green-text)", bg: "var(--c-green-bg)", border: "var(--c-green-border, #bbf7d0)" },
  product:  { plural: "Products",   color: "#7c3aed",             bg: "#f3e8ff",           border: "#ddd6fe"                        },
  brand:    { plural: "Brands",     color: "#c2410c",             bg: "#fff7ed",           border: "#fed7aa"                        },
  category: { plural: "Categories", color: "#0f766e",             bg: "#f0fdfa",           border: "#99f6e4"                        },
};

const TYPE_ORDER: BinType[] = ["invoice", "customer", "product", "brand", "category"];

function DaysLeftPill({ daysLeft }: { daysLeft: number }) {
  const red    = daysLeft <= 7;
  const yellow = !red && daysLeft <= 14;
  const color  = red ? "var(--c-red)"  : yellow ? "#b45309"  : "var(--c-green-text)";
  const bg     = red ? "var(--c-red-bg)" : yellow ? "#fef9c3" : "var(--c-green-bg)";
  const border = red ? "#fecaca"       : yellow ? "#fde68a"  : "var(--c-green-border, #bbf7d0)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "0.125rem 0.625rem", borderRadius: "9999px",
      fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap",
      background: bg, color, border: `1px solid ${border}`,
    }}>
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
  type, items, onRestore, onDeleteForever,
}: {
  type: BinType;
  items: BinItem[];
  onRestore: (item: BinItem) => void;
  onDeleteForever: (item: BinItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const m = TYPE_META[type];
  if (items.length === 0) return null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "0.625rem",
          width: "100%", padding: "0.875rem 1rem",
          background: "none", border: "none",
          borderBottom: open ? "1px solid var(--c-border)" : "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "0.125rem 0.75rem", borderRadius: "9999px",
          fontSize: "0.75rem", fontWeight: 600,
          background: m.bg, color: m.color, border: `1px solid ${m.border}`,
        }}>
          {m.plural}
        </span>
        <span style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", fontWeight: 500 }}>
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            marginLeft: "auto", color: "var(--c-text-4)",
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="table-wrap">
          <table className="table-base" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>
            <thead>
              <tr>
                {BIN_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Cell col={BIN_COLUMNS[0]} style={{ fontWeight: 500, color: "var(--c-text)" }}>
                    {item.name}
                  </Cell>
                  <Cell col={BIN_COLUMNS[1]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", wordBreak: "break-word" }}>
                    {item.meta || <span style={{ color: "var(--c-text-4)" }}>—</span>}
                  </Cell>
                  <Cell col={BIN_COLUMNS[2]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                    {new Date(item.deletedAt).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </Cell>
                  <Cell col={BIN_COLUMNS[3]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                    {item.deletedBy ?? <span style={{ color: "var(--c-text-4)" }}>—</span>}
                  </Cell>
                  <Cell col={BIN_COLUMNS[4]}>
                    <DaysLeftPill daysLeft={item.daysLeft} />
                  </Cell>
                  <Cell col={BIN_COLUMNS[5]}>
                    <div className="table-actions">
                      <Button variant="editOutline" size="sm" onClick={() => onRestore(item)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>Restore</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => onDeleteForever(item)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>Delete Forever</Button>
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

export default function BinPage() {
  const { data, loading, mutate } = useFetch<BinItem[]>("/api/bin");
  const items = data ?? [];
  const toast = useToast();

  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; confirmLabel: string; variant: "default" | "danger"; onConfirm: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

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

  const grouped = TYPE_ORDER.reduce((acc, t) => {
    acc[t] = items.filter(i => i.type === t);
    return acc;
  }, {} as Record<BinType, BinItem[]>);

  const totalCount = items.length;

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

      <div className="page-header">
        <div>
          <h1 className="page-title">Recycle Bin</h1>
          <p className="page-sub">
            {loading
              ? "Loading…"
              : totalCount === 0
              ? "Bin is empty"
              : `${totalCount} item${totalCount !== 1 ? "s" : ""} — auto-purged after 30 days`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Name</th><th>Details</th><th>Deleted On</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody><TableSkeleton cols={6} /></tbody>
            </table>
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--c-text-4)" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ margin: "0 auto 0.75rem", display: "block", opacity: 0.3 }}>
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Bin is empty — nothing has been deleted recently.
        </div>
      ) : (
        TYPE_ORDER.map(type => (
          <TypeSection
            key={type}
            type={type}
            items={grouped[type]}
            onRestore={handleRestore}
            onDeleteForever={handleDeleteForever}
          />
        ))
      )}
    </div>
    </>
  );
}
