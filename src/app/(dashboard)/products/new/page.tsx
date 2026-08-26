"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ProductFormFields } from "@/components/products/ProductFormFields";
import { validateProductForm, hasProductFieldErrors, type ProductFormData, type ProductFieldErrors } from "@/lib/productForm";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import styles from "./productNew.module.css";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

const BLANK_FORM: ProductFormData = {
  name: "", sku: "", hsn: "", description: "", unit: "Nos",
  price: "", purchasePrice: "", gstRate: "18", stock: "0", minStock: "5",
  brandId: "", categoryId: "",
};
const DRAFT_KEY = "product:new";

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductFormData>(BLANK_FORM);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  useEffect(() => {
    fetch("/api/brands?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((d) => setBrands(d.data ?? [])).catch(() => {});
    fetch("/api/categories?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((d) => setCategories(d.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const draft = loadFormDraft<ProductFormData>(DRAFT_KEY);
    const v = draft?.values;
    const hasContent = !!v && Object.entries(v).some(([k, val]) => k !== "unit" && k !== "gstRate" && k !== "stock" && k !== "minStock" && String(val ?? "").trim());
    if (hasContent) setShowDraftBanner(true);
    else setDraftReady(true);
  }, []);

  function restoreDraft() {
    const draft = loadFormDraft<ProductFormData>(DRAFT_KEY);
    if (draft?.values) setForm(draft.values);
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  function dismissDraft() {
    setConfirmDiscardDraftOpen(true);
  }

  function discardDraft() {
    clearFormDraft(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftReady(true);
    setConfirmDiscardDraftOpen(false);
  }

  useFormDraft(DRAFT_KEY, form, !draftReady || saving);

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
    if (res.ok) {
      const created = await res.json();
      clearFormDraft(DRAFT_KEY);
      bustCachePrefix("/api/products");
      bustCachePrefix("/api/reports");
      toast({ type: "success", title: "Product created", message: "New product added to catalog." });
      // Deliberately not resetting `saving` here — it must stay locked until
      // navigation actually replaces this page.
      router.push(`/products/${created.id}`);
      return;
    }
    { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to save product." }); }
    setSaving(false);
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Products", href: "/products" }, { label: "New Product" }]} />
      <div>
        <h1 className="page-title">Add Product</h1>
        <p className="page-sub">Add a product or item to your catalog</p>
      </div>
      {showDraftBanner && (
        <InfoBanner
          message="You have an unsaved product draft from earlier — want to resume it?"
          actionLabel="Resume draft"
          onAction={restoreDraft}
          onDismiss={dismissDraft}
        />
      )}
      <form onSubmit={handleSubmit} noValidate {...animateSection(0, "form-card")}>
        <ProductFormFields form={form} onChange={handleChange} onUnitChange={(v) => { setForm((prev) => ({ ...prev, unit: v })); setFieldErrors((prev) => ({ ...prev, unit: undefined })); }} fieldErrors={fieldErrors} brands={brands} categories={categories} />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Save Product</Button>
          <Button variant="secondary" href="/products"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
