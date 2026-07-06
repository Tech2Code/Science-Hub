"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import styles from "./productNew.module.css";

const UNITS = ["Nos", "Kg", "Ltr", "Box", "Pack", "Set", "Mtr", "Pcs"];
const GST_RATES = [0, 5, 12, 18, 28];

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: "", sku: "", description: "", unit: "Nos",
    price: "", purchasePrice: "", gstRate: "18", stock: "0", minStock: "5",
    brandId: "", categoryId: "",
  });
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/brands", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(setBrands).catch(() => {});
    fetch("/api/categories", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "name" || name === "price") setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(form.name,  rules.required("Product name is required."));
    const priceErr = validate(form.price, rules.required("Price is required."), rules.positiveNumber("Price must be greater than 0."));
    if (nameErr || priceErr) { setFieldErrors({ name: nameErr ?? undefined, price: priceErr ?? undefined }); return; }
    setFieldErrors({}); setSaving(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: parseFloat(form.price),
        purchasePrice: form.purchasePrice.trim() ? parseFloat(form.purchasePrice) : null,
        gstRate: parseInt(form.gstRate),
        stock: parseInt(form.stock),
        minStock: parseInt(form.minStock),
        brandId: form.brandId || undefined,
        categoryId: form.categoryId || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/products");
      bustCache("/api/reports?type=summary");
      bustCache("/api/reports?type=stock");
      toast({ type: "success", title: "Product created", message: "New product added to catalog." });
      router.push("/products");
    }
    else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to save product." }); }
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Products", href: "/products" }, { label: "New Product" }]} />
      <div>
        <h1 className="page-title">Add Product</h1>
        <p className="page-sub">Add a product or item to your catalog</p>
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
          <FormField label="Purchase Price (₹)" hint="Used to auto-fill the rate on Purchase Bills.">
            <Input name="purchasePrice" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={handleChange} placeholder="0.00" />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Opening Stock">
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

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Save Product</Button>
          <Button variant="secondary" href="/products"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
