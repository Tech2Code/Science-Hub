"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ProductFormFields } from "@/components/products/ProductFormFields";
import { validateProductForm, hasProductFieldErrors, type ProductFormData, type ProductFieldErrors } from "@/lib/productForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import styles from "./productNew.module.css";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductFormData>({
    name: "", sku: "", description: "", unit: "Nos",
    price: "", purchasePrice: "", gstRate: "18", stock: "0", minStock: "5",
    brandId: "", categoryId: "",
  });
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/brands", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(setBrands).catch(() => {});
    fetch("/api/categories", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name in fieldErrors) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateProductForm(form);
    if (hasProductFieldErrors(errors)) { setFieldErrors(errors); return; }
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
      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <ProductFormFields form={form} onChange={handleChange} fieldErrors={fieldErrors} brands={brands} categories={categories} />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Save Product</Button>
          <Button variant="secondary" href="/products"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
