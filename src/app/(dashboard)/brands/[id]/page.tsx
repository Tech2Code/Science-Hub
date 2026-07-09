"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import styles from "./view.module.css";

interface BrandProduct {
  id: string; name: string; sku: string | null; price: number; stock: number; minStock: number;
}
interface Brand {
  id: string; name: string; createdAt: string | null; createdBy: string | null; products: BrandProduct[];
}

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div className={styles.skeletonBlock} style={{ width: w, height: h, borderRadius: r } as React.CSSProperties} />
  );
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

  useEffect(() => {
    fetchCached(`/api/brands/${id}`)
      .then((d) => { setBrand(d as Brand); setLoading(false); })
      .catch(() => { setError("Brand not found."); setLoading(false); });
  }, [id]);

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

  if (loading) return (
    <div className={`page-stack ${styles.pageStack}`}>
      <Sk w={160} h={13} />
      <div className={`card ${styles.headerCard}`}>
        <div className={styles.skRow}>
          <div className={styles.skLeftRow}>
            <Sk w={48} h={48} r={9999} />
            <div className={styles.skCol}><Sk w={160} h={20} /><Sk w={140} h={13} /></div>
          </div>
          <div className={styles.skActions}><Sk w={90} h={32} r={8} /></div>
        </div>
      </div>
      <div className={styles.statsGrid}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`card ${styles.skStatCard}`}><Sk w={80} h={11} /><Sk w={100} h={22} /></div>
        ))}
      </div>
      <div className="card">
        <div className={styles.skTableHead}><Sk w={140} h={14} /></div>
        <div className="table-wrap">
          <table className="table-base"><tbody><TableSkeleton cols={4} rows={4} /></tbody></table>
        </div>
      </div>
    </div>
  );

  if (error || !brand)
    return <div className={`loading-center ${styles.errorCenter}`}>{error || "Brand not found."}</div>;

  const lowStockCount = brand.products.filter((p) => p.stock <= p.minStock).length;

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Brand"
        message={`Move "${brand.name}" to bin?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />

      <Breadcrumb items={[{ label: "Brands", href: "/brands" }, { label: brand.name }]} />

      <div className={`card ${styles.headerCard}`}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{brand.name[0]?.toUpperCase()}</div>
            <div>
              <h1 className="page-title">{brand.name}</h1>
              {(brand.createdBy || brand.createdAt) && (
                <div className={styles.metaText}>
                  {brand.createdBy && <>Added by {brand.createdBy}</>}
                  {brand.createdAt && <> · {new Date(brand.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>}
                </div>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Products</div>
          <div className={styles.statValue}>{brand.products.length}</div>
        </div>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Low Stock</div>
          <div className={`${styles.statValue} ${lowStockCount > 0 ? styles.negative : ""}`}>{lowStockCount}</div>
        </div>
        <div className={`card ${styles.cardPadSm}`}>
          <div className={styles.statLabel}>Catalog Value</div>
          <div className={styles.statValue}>₹{brand.products.reduce((s, p) => s + p.price * p.stock, 0).toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div className="card">
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
              {brand.products.length === 0 ? (
                <tr><td colSpan={4} className={styles.emptyCell}>No products under this brand.</td></tr>
              ) : brand.products.map((p) => (
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
