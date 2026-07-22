"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TableSkeleton, SkeletonSwap } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import styles from "./view.module.css";

interface BrandProduct {
  id: string; name: string; sku: string | null; price: number; stock: number; minStock: number;
}
interface Brand {
  id: string; name: string; createdAt: string | null; createdBy: string | null; updatedAt?: string; products: BrandProduct[];
}

export default function BrandViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  useEffect(() => {
    fetchCached(`/api/brands/${id}`)
      .then((d) => { setBrand(d as Brand); setLoading(false); })
      .catch(() => { setError("Brand not found."); setLoading(false); });
  }, [id]);

  function startRename() {
    if (!brand) return;
    setRenameValue(brand.name);
    setRenaming(true);
  }

  async function saveRename() {
    const name = renameValue.trim();
    if (!name || !brand) return;
    setSavingRename(true);
    try {
      const res = await fetch(`/api/brands/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expectedUpdatedAt: brand.updatedAt }),
      });
      const data = await res.json().catch(() => ({}));
      setSavingRename(false);
      if (res.ok) {
        setBrand((prev) => (prev ? { ...prev, name } : prev));
        bustCache("/api/brands");
        setRenaming(false);
        toast({ type: "success", title: "Brand renamed", message: `Renamed to "${name}".` });
      } else if (res.status === 409) {
        bustCache(`/api/brands/${id}`);
        toast({ type: "error", title: "Update conflict", message: data.error ?? "This brand was changed by someone else. Please reload and try again." });
      } else {
        toast({ type: "error", title: "Rename failed", message: data.error ?? "Could not rename brand." });
      }
    } catch {
      setSavingRename(false);
      toast({ type: "error", title: "Rename failed", message: "Network error." });
    }
  }

  async function handleDelete() {
    if (!brand) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setDeleting(false);
      setConfirmOpen(false);
      if (res.ok) {
        bustCache("/api/brands");
        toast({ type: "success", title: "Brand deleted", message: `"${brand.name}" moved to bin.` });
        router.push("/brands");
      } else {
        toast({ type: "error", title: "Cannot delete brand", message: data.error ?? "Could not delete brand." });
      }
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
  }

  if (!loading && (error || !brand))
    return <div className={`loading-center ${styles.errorCenter}`}>{error || "Brand not found."}</div>;

  // Rendered unconditionally (loading or loaded) so adding/removing a header
  // button, stat, or column only ever needs one edit — see SkeletonSwap.
  const products = brand?.products ?? [];
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;
  const catalogValue = products.reduce((s, p) => s + p.price * p.stock, 0);

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Brand"
        message={`Move "${brand?.name ?? ""}" to bin?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />

      <Breadcrumb items={brand ? [{ label: "Brands", href: "/brands" }, { label: brand.name }] : [{ label: "Brands", href: "/brands" }]} />

      <div {...animateSection(0, `card ${styles.headerCard}`)}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>
              <SkeletonSwap loading={loading} w={48} h={48} r={9999}>{brand?.name?.[0]?.toUpperCase()}</SkeletonSwap>
            </div>
            {renaming ? (
              <div className={styles.renameRow}>
                <Input
                  sz="sm"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
                />
                <Button size="sm" variant="primary" onClick={saveRename} disabled={!renameValue.trim() || savingRename}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setRenaming(false)} disabled={savingRename}>Cancel</Button>
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <h1 className="page-title" title={brand?.name}>
                  <SkeletonSwap loading={loading} w={160} h={20}>{brand?.name}</SkeletonSwap>
                </h1>
                {!loading && (brand?.createdBy || brand?.createdAt) && (
                  <div className={styles.metaText}>
                    {brand?.createdBy && <>Added by {brand.createdBy}</>}
                    {brand?.createdAt && <> · {new Date(brand.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            {!renaming && (
              <Button variant="editOutline" disabled={loading} onClick={startRename}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Rename
              </Button>
            )}
            <Button variant="danger" disabled={loading} onClick={() => setConfirmOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div {...animateSection(1, styles.statsGrid)}>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Products</div>
          <div className={styles.statValue}><SkeletonSwap loading={loading} w={40} h={22}>{products.length}</SkeletonSwap></div>
        </div>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Low Stock</div>
          <div className={`${styles.statValue} ${!loading && lowStockCount > 0 ? styles.negative : ""}`}>
            <SkeletonSwap loading={loading} w={40} h={22}>{lowStockCount}</SkeletonSwap>
          </div>
        </div>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Catalog Value</div>
          <div className={styles.statValue}>
            <SkeletonSwap loading={loading} w={80} h={22}>₹{catalogValue.toLocaleString("en-IN")}</SkeletonSwap>
          </div>
        </div>
      </div>

      <div {...animateSection(2, "card")}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Products</h2>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th className="table-th-right">Price</th>
                <th className="table-th-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={4} rows={4} />
              ) : products.length === 0 ? (
                <tr><td colSpan={4} className={styles.emptyCell}>No products under this brand.</td></tr>
              ) : products.map((p) => (
                <tr key={p.id}>
                  <td data-mobile-full data-label="Name">
                    <Link href={`/products/${p.id}`} className={styles.productLink}>{p.name}</Link>
                  </td>
                  <td data-label="SKU" className={styles.mutedCell}>{p.sku || "—"}</td>
                  <td data-label="Price" className="table-td-right">₹{p.price.toLocaleString("en-IN")}</td>
                  <td data-label="Stock" className={`table-td-right ${p.stock <= p.minStock ? styles.stockLow : ""}`}>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
