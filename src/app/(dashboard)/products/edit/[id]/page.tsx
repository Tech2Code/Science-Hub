"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import styles from "./productEdit.module.css";

const UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen"];
const GST_RATES = [0, 5, 12, 18, 28];

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div className={styles.skeletonBlock} style={{ width: w, height: h, borderRadius: r } as React.CSSProperties} />
  );
}

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

interface FormData {
  name: string; sku: string; description: string; unit: string;
  price: string; purchasePrice: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
}

export default function EditProductPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<FormData>({
    name: "", sku: "", description: "", unit: "Nos",
    price: "", purchasePrice: "", gstRate: "18", stock: "0", minStock: "0",
    brandId: "", categoryId: "",
  });
  const [initialForm, setInitialForm] = useState<FormData | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string; purchasePrice?: string; stock?: string; minStock?: string }>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${id}`, { headers: { "x-no-loader": "1" } }).then((r) => r.json()),
      fetch("/api/brands", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).catch(() => []),
      fetch("/api/categories", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).catch(() => []),
    ])
      .then(([product, b, c]) => {
        const loaded: FormData = {
          name: product.name ?? "", sku: product.sku ?? "",
          description: product.description ?? "", unit: product.unit ?? "Nos",
          price: product.price?.toString() ?? "", purchasePrice: product.purchasePrice != null ? product.purchasePrice.toString() : "",
          gstRate: product.gstRate?.toString() ?? "18",
          stock: product.stock?.toString() ?? "0", minStock: product.minStock?.toString() ?? "0",
          brandId: product.brandId ?? "", categoryId: product.categoryId ?? "",
        };
        setForm(loaded);
        setInitialForm(loaded);
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
      }),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/products");
      bustCache("/api/reports?type=summary");
      bustCache("/api/reports?type=stock");
      toast({ type: "success", title: "Product updated", message: "Changes saved." });
      router.push(`/products/${id}`);
    } else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update product." }); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr          = validate(form.name,  rules.required("Product name is required."));
    const priceErr         = validate(form.price, rules.required("Price is required."), rules.positiveNumber("Price must be greater than 0."));
    const purchasePriceErr = form.purchasePrice.trim() ? validate(form.purchasePrice, rules.nonNegativeNumber("Purchase price cannot be negative.")) : null;
    const stockErr         = validate(form.stock, rules.required("Stock is required."), rules.nonNegativeNumber("Stock cannot be negative."));
    const minStockErr      = validate(form.minStock, rules.required("Minimum stock is required."), rules.nonNegativeNumber("Minimum stock cannot be negative."));
    if (nameErr || priceErr || purchasePriceErr || stockErr || minStockErr) {
      setFieldErrors({ name: nameErr ?? undefined, price: priceErr ?? undefined, purchasePrice: purchasePriceErr ?? undefined, stock: stockErr ?? undefined, minStock: minStockErr ?? undefined });
      return;
    }
    setFieldErrors({}); setConfirmOpen(true);
  }

  // Renders the same OverlayLoader used by the "Edit"/"View" buttons that
  // navigate here, on top of a skeleton shaped like the real form — keeps
  // the loading experience visually continuous instead of swapping to a
  // blank/plain-text loader once this page mounts.
  if (loading) return (
    <>
      <OverlayLoader text="Loading product…" />
      <div className={`page-stack ${styles.pageStack}`}>
        <Sk w={160} h={13} />
        <div className={styles.skRow}>
          <div className={styles.skFieldStack}>
            <Sk w={180} h={20} />
            <Sk w={140} h={14} />
          </div>
          <Sk w={110} h={32} r={8} />
        </div>
        <div className="form-card">
          <div className="form-grid-2">
            <div className={styles.skFieldStack}><Sk w={100} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={100} h={12} /><Sk h={38} r={8} /></div>
          </div>
          <div className={styles.skFieldStack}><Sk w={100} h={12} /><Sk h={60} r={8} /></div>
          <div className="form-grid-3">
            <div className={styles.skFieldStack}><Sk w={60} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={100} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={70} h={12} /><Sk h={38} r={8} /></div>
          </div>
          <div className="form-grid-2">
            <div className={styles.skFieldStack}><Sk w={90} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={90} h={12} /><Sk h={38} r={8} /></div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
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

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <FormField label="Product Name" required error={fieldErrors.name}>
            <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Beaker 250ml Borosilicate" />
          </FormField>
          <FormField label="SKU / Item Code">
            <Input name="sku" value={form.sku} onChange={handleChange} placeholder="e.g. BKR-250-BOR" mono />
          </FormField>
        </div>

        <FormField label="Description">
          <Textarea name="description" rows={2} value={form.description} onChange={handleChange} placeholder="Brief product description…" />
        </FormField>

        <div className="form-grid-3">
          <FormField label="Unit">
            <Select name="unit" value={form.unit} onChange={handleChange}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormField>
          <FormField label="Selling Price (₹)" required error={fieldErrors.price}>
            <Input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} placeholder="0.00" />
          </FormField>
          <FormField label="GST Rate">
            <Select name="gstRate" value={form.gstRate} onChange={handleChange}>
              {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Purchase Price (₹)" hint="Used to auto-fill the rate on Purchase Bills." error={fieldErrors.purchasePrice}>
            <Input name="purchasePrice" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={handleChange} placeholder="0.00" />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Current Stock" error={fieldErrors.stock}>
            <Input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} />
          </FormField>
          <FormField label="Minimum Stock" hint="Alert triggers when stock drops to or below this." error={fieldErrors.minStock}>
            <Input name="minStock" type="number" min="0" value={form.minStock} onChange={handleChange} />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Brand">
            <Select name="brandId" value={form.brandId} onChange={handleChange}>
              <option value="">— None —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Category">
            <Select name="categoryId" value={form.categoryId} onChange={handleChange}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="form-actions-wrap">
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={saving || (initialForm !== null && JSON.stringify(form) === JSON.stringify(initialForm))}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Product
            </Button>
            <Button variant="secondary" href={`/products/${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
          </div>
          {initialForm !== null && JSON.stringify(form) === JSON.stringify(initialForm) && !saving && (
            <span className={styles.noChanges}>No changes detected.</span>
          )}
        </div>
      </form>
    </div>
    </>
  );
}
