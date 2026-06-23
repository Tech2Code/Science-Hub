"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

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
    price: "", gstRate: "18", stock: "0", minStock: "5",
    brandId: "", categoryId: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands).catch(() => {});
    fetch("/api/categories").then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Product name is required."); return; }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setError("Enter a valid price."); return;
    }
    setError(""); setSaving(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: parseFloat(form.price),
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
    else { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed to save product."); }
  }

  return (
    <div className="page-stack" style={{ maxWidth: "42rem" }}>
      <Breadcrumb items={[{ label: "Products", href: "/products" }, { label: "New Product" }]} />
      <div>
        <h1 className="page-title">Add Product</h1>
        <p className="page-sub">Add a product or item to your catalog</p>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <FormField label="Product Name" required>
            <Input name="name" required value={form.name} onChange={handleChange} placeholder="e.g. Beaker 250ml Borosilicate" />
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
          <FormField label="Price (₹)" required>
            <Input name="price" type="number" required min="0" step="0.01" value={form.price} onChange={handleChange} placeholder="0.00" />
          </FormField>
          <FormField label="GST Rate">
            <Select name="gstRate" value={form.gstRate} onChange={handleChange}>
              {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
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
          <Button type="submit" variant="primary" loading={saving} fullScreen disabled={saving}>
            {saving ? "Saving…" : "Save Product"}
          </Button>
          <Button variant="secondary" href="/products">Cancel</Button>
        </div>
      </form>
    </div>
  );
}
