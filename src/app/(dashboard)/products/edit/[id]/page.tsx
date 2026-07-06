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

const UNITS = ["Nos", "Kg", "Ltr", "Box", "Pack", "Set", "Mtr", "Pcs"];
const GST_RATES = [0, 5, 12, 18, 28];

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

interface FormData {
  name: string; sku: string; description: string; unit: string;
  price: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
}

export default function EditProductPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<FormData>({
    name: "", sku: "", description: "", unit: "Nos",
    price: "", gstRate: "18", stock: "0", minStock: "0",
    brandId: "", categoryId: "",
  });
  const [initialForm, setInitialForm] = useState<FormData | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string }>({});
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
          price: product.price?.toString() ?? "", gstRate: product.gstRate?.toString() ?? "18",
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
    if (name === "name" || name === "price") setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function doSave() {
    setConfirmOpen(false); setSaving(true);
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, sku: form.sku, description: form.description, unit: form.unit,
        price: parseFloat(form.price), gstRate: parseInt(form.gstRate),
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
      router.push("/products");
    } else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update product." }); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(form.name,  rules.required("Product name is required."));
    const priceErr = validate(form.price, rules.required("Price is required."), rules.positiveNumber("Price must be greater than 0."));
    if (nameErr || priceErr) { setFieldErrors({ name: nameErr ?? undefined, price: priceErr ?? undefined }); return; }
    setFieldErrors({}); setConfirmOpen(true);
  }

  if (loading) return <div className="loading-center">Loading product…</div>;

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
          <FormField label="Price (₹)" required error={fieldErrors.price}>
            <Input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} placeholder="0.00" />
          </FormField>
          <FormField label="GST Rate">
            <Select name="gstRate" value={form.gstRate} onChange={handleChange}>
              {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Current Stock">
            <Input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} />
          </FormField>
          <FormField label="Minimum Stock" hint="Alert triggers when stock drops to or below this.">
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
            <Button variant="secondary" href="/products"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
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
