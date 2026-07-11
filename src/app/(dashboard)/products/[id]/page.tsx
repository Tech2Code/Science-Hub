"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { OverlayLoader } from "@/components/ui/Spinner";
import { TableSkeleton, SkeletonSwap } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import styles from "./view.module.css";

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}
interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  price: number;
  purchasePrice: number | null;
  gstRate: number;
  stock: number;
  minStock: number;
  createdAt: string;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  stockMovements: StockMovement[];
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProductViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingEdit, setOpeningEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCached(`/api/products/${id}`)
      .then((d) => { setProduct(d as Product); setLoading(false); })
      .catch(() => { setError("Product not found."); setLoading(false); });
  }, [id]);

  async function handleDelete() {
    if (!product) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setDeleting(false);
      setConfirmOpen(false);
      if (res.ok) {
        bustCache("/api/products");
        toast({ type: "success", title: "Product deleted", message: `"${product.name}" moved to bin.` });
        router.push("/products");
      } else {
        toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete product." });
      }
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
  }

  if (!loading && (error || !product))
    return <div className={`loading-center ${styles.errorCenter}`}>{error || "Product not found."}</div>;

  // Rendered unconditionally (loading or loaded) so adding/removing a header
  // button, stat, or column only ever needs one edit — see SkeletonSwap.
  const movements = product?.stockMovements ?? [];
  const isLow = !!product && product.stock <= product.minStock;
  const marginAmount = product?.purchasePrice != null ? product.price - product.purchasePrice : null;
  const marginPct = product?.purchasePrice != null && product.purchasePrice > 0
    ? (marginAmount! / product.purchasePrice) * 100
    : null;

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      {openingEdit && <OverlayLoader text="Opening editor…" />}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Product"
        message={`Move "${product?.name ?? ""}" to bin?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />

      <Breadcrumb items={product ? [{ label: "Products", href: "/products" }, { label: product.name }] : [{ label: "Products", href: "/products" }]} />

      {/* Header */}
      <div {...animateSection(0, `card ${styles.headerCard}`)}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>
              <SkeletonSwap loading={loading} w={48} h={48} r={9999}>{product?.name?.[0]?.toUpperCase()}</SkeletonSwap>
            </div>
            <div>
              <h1 className="page-title"><SkeletonSwap loading={loading} w={160} h={20}>{product?.name}</SkeletonSwap></h1>
              <div className={styles.metaRow}>
                {!loading && product?.category && <span className={styles.badge}>{product.category.name}</span>}
                {!loading && product?.brand && <span className={styles.badge}>{product.brand.name}</span>}
                {!loading && product && <span className={styles.badge}>{product.unit}</span>}
              </div>
              {!loading && product?.sku && <code className={styles.skuCode}>SKU: {product.sku}</code>}
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" disabled={loading} onClick={() => { setOpeningEdit(true); router.push(`/products/edit/${id}`); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </Button>
            <Button variant="danger" disabled={loading} onClick={() => setConfirmOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </Button>
          </div>
        </div>
        {!loading && product?.description && (
          <div className={styles.descriptionBlock}>
            <div className={styles.descriptionLabel}>Description</div>
            <p className={styles.descriptionText}>{product.description}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div {...animateSection(1, styles.statsGrid)}>
        {[
          { label: "Selling Price", value: product ? fmt(product.price) : "" },
          { label: "Purchase Price", value: product?.purchasePrice != null ? fmt(product.purchasePrice) : "—" },
          {
            label: "Margin",
            value: marginAmount != null ? fmt(marginAmount) : "—",
            sub: marginPct != null ? `${marginPct.toFixed(1)}% over cost` : undefined,
            tone: marginAmount != null ? (marginAmount > 0 ? "positive" as const : marginAmount < 0 ? "negative" as const : undefined) : undefined,
          },
          { label: "GST Rate", value: product ? `${product.gstRate}%` : "" },
          {
            label: "Stock",
            value: product ? `${product.stock} ${product.unit}` : "",
            sub: product ? (isLow ? `⚠ Below min (${product.minStock})` : `Min: ${product.minStock}`) : undefined,
            tone: isLow ? "negative" as const : "positive" as const,
          },
        ].map((s) => (
          <div key={s.label} className={`card ${styles.cardPadSm}`}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={`${styles.statValue} ${!loading && s.tone === "positive" ? styles.positive : !loading && s.tone === "negative" ? styles.negative : ""}`}>
              <SkeletonSwap loading={loading} w={100} h={22}>{s.value}</SkeletonSwap>
            </div>
            {!loading && s.sub && <div className={styles.statSub}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Stock movement history */}
      <div {...animateSection(2, "card")}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Stock Movements</h2>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Type</th>
                <th className="table-th-right">Quantity</th>
                <th className="table-th-right">Balance After</th>
                <th>Reference</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={5} rows={4} />
              ) : movements.length === 0 ? (
                <tr><td colSpan={5} className={styles.emptyCell}>No stock movements recorded yet.</td></tr>
              ) : movements.map((m) => (
                <tr key={m.id}>
                  <td data-mobile-full data-label="Type"><span className={styles.typeBadge}>{m.type}</span></td>
                  <td data-label="Quantity" className={`table-td-right ${m.quantity >= 0 ? styles.qtyIn : styles.qtyOut}`}>
                    {m.quantity >= 0 ? "+" : ""}{m.quantity}
                  </td>
                  <td data-label="Balance After" className="table-td-right">{m.balanceAfter}</td>
                  <td data-label="Reference" className={styles.dateCellText}>{m.reference || m.notes || "—"}</td>
                  <td data-label="Date" className={styles.dateCellText}>
                    {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
