"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ProductFormFields } from "@/components/products/ProductFormFields";
import { validateProductForm, hasProductFieldErrors, type ProductFormData, type ProductFieldErrors } from "@/lib/productForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import styles from "./productEdit.module.css";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

export default function EditProductPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<ProductFormData>({
    name: "", sku: "", description: "", unit: "Nos",
    price: "", purchasePrice: "", gstRate: "18", stock: "0", minStock: "0",
    brandId: "", categoryId: "",
  });
  const [initialForm, setInitialForm] = useState<ProductFormData | null>(null);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${id}`, { headers: { "x-no-loader": "1" } }).then((r) => r.json()),
      fetch("/api/brands", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).catch(() => []),
      fetch("/api/categories", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).catch(() => []),
    ])
      .then(([product, b, c]) => {
        const loaded: ProductFormData = {
          name: product.name ?? "", sku: product.sku ?? "",
          description: product.description ?? "", unit: product.unit ?? "Nos",
          price: product.price?.toString() ?? "", purchasePrice: product.purchasePrice != null ? product.purchasePrice.toString() : "",
          gstRate: product.gstRate?.toString() ?? "18",
          stock: product.stock?.toString() ?? "0", minStock: product.minStock?.toString() ?? "0",
          brandId: product.brandId ?? "", categoryId: product.categoryId ?? "",
        };
        setForm(loaded);
        setInitialForm(loaded);
        setLoadedUpdatedAt(product.updatedAt ?? null);
        setBrands(b); setCategories(c); setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name in fieldErrors) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function doSave() {
    setConfirmOpen(false); setSaving(true);
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, sku: form.sku, description: form.description, unit: form.unit,
        price: parseFloat(form.price), purchasePrice: form.purchasePrice.trim() ? parseFloat(form.purchasePrice) : null,
        gstRate: parseInt(form.gstRate),
        stock: parseInt(form.stock), minStock: parseInt(form.minStock),
        brandId: form.brandId || null, categoryId: form.categoryId || null,
        expectedUpdatedAt: loadedUpdatedAt,
      }),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/products");
      bustCache("/api/reports?type=summary");
      bustCache("/api/reports?type=stock");
      toast({ type: "success", title: "Product updated", message: "Changes saved." });
      router.push(`/products/${id}`);
    }
    else if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      bustCache(`/api/products/${id}`);
      toast({ type: "error", title: "Update conflict", message: d?.error ?? "This product was changed by someone else. Please reload and try again." });
    }
    else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update product." }); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateProductForm(form);
    if (hasProductFieldErrors(errors)) { setFieldErrors(errors); return; }
    setFieldErrors({}); setConfirmOpen(true);
  }

  const noChanges = initialForm !== null && JSON.stringify(form) === JSON.stringify(initialForm);
  const disabled = loading || saving;

  return (
    <>
    {loading && <OverlayLoader text="Loading product…" />}
    {!loading && saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <ConfirmDialog
        open={confirmOpen}
        title="Save Changes"
        message="Are you sure you want to update this product's details?"
        confirmLabel="Save Changes"
        loading={saving}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <Breadcrumb items={[{ label: "Products", href: "/products" }, { label: "Edit Product" }]} />

      <div className={styles.headerRow}>
        <div>
          <h1 className="page-title">Edit Product</h1>
          <p className="page-sub">{form.name || "—"}</p>
        </div>
        <div className={styles.idCol}>
          <span className={styles.idLabel}>Product ID</span>
          <code className={styles.idValue}>
            {id}
          </code>
        </div>
      </div>

      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <ProductFormFields form={form} onChange={handleChange} fieldErrors={fieldErrors} brands={brands} categories={categories} disabled={disabled} stockLabel="Current Stock" />

        <div className="form-actions-wrap">
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={disabled || noChanges}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Product
            </Button>
            <Button variant="secondary" href={`/products/${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
          </div>
          {!loading && noChanges && !saving && (
            <span className={styles.noChanges}>No changes detected.</span>
          )}
        </div>
      </form>
    </div>
    </>
  );
}
