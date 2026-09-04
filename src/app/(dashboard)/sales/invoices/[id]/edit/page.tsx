"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Sk } from "@/components/ui/Skeleton";
import { fetchCached, bustCache, bustCachePrefix } from "@/lib/useCache";
import { invalidateCachedPdf } from "@/lib/pdfCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate, validateForm, hasErrors, type FormErrors } from "@/lib/validation";
import { useDirty } from "@/lib/useDirty";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import { InvoiceOptionsRow } from "@/components/invoices/InvoiceOptionsRow";
import { InvoiceLineItemsCard } from "@/components/invoices/InvoiceLineItemsCard";
import { computeInvoiceTotals, makeInvoiceLineItemKey, type InvoiceLineItem, type InvoiceProduct } from "@/lib/invoiceCalc";
import { animateSection } from "@/lib/animateSection";
import { getIndianFinancialYear } from "@/lib/documentNumbering";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import styles from "./edit.module.css";

type Product = InvoiceProduct;
type LineItem = InvoiceLineItem;

interface Customer {
  id: string; name: string; city: string; state: string; gstin: string;
  phone?: string | null; email?: string | null; address?: string | null; pincode?: string | null;
}

interface InvoiceData {
  id: string; invoiceNumber: string; status: string; date: string; updatedAt?: string;
  isInterState: boolean; placeOfSupply?: string; reverseCharge?: boolean; dueDate?: string; notes?: string;
  transportCharge?: number; transportChargeGstRate?: number;
  customer: Customer;
  items: Array<{ productId: string | null; name: string; unit: string; quantity: number; price: number; gstRate: number; hsn?: string; discountPercent?: number; }>;
}

type CustomerForm = { name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string };
const BLANK_CUSTOMER_FORM: CustomerForm = { name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" };

export default function EditInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  // Default true; the load effect below sets it false if the saved transportCharge was 0/absent.
  const [transportChargeEnabled, setTransportChargeEnabled] = useState(true);
  const [transportCharge, setTransportCharge] = useState("");
  const [transportChargeGstRate, setTransportChargeGstRate] = useState("18");
  const [transportChargeError, setTransportChargeError] = useState<string | undefined>(undefined);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);
  const [showCreditLimitDialog, setShowCreditLimitDialog] = useState(false);
  const [creditLimitMessage, setCreditLimitMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerEditId, setCustomerEditId] = useState<string | null>(null);
  const [dontSaveCustomer, setDontSaveCustomer] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(BLANK_CUSTOMER_FORM);
  const [customerErrors, setCustomerErrors] = useState<FormErrors<CustomerForm>>({});
  const [customerSaving, setCustomerSaving] = useState(false);
  const { isDirty, markClean } = useDirty({ customerId, isInterState, placeOfSupply, reverseCharge, items, notes, dueDate, invoiceDate, transportChargeEnabled, transportCharge, transportChargeGstRate });

  const DRAFT_KEY = `invoice:edit:${id}`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  type InvoiceEditDraft = {
    customerId: string; isInterState: boolean; placeOfSupply: string; reverseCharge: boolean;
    items: LineItem[]; notes: string; dueDate: string; invoiceDate: string;
    transportChargeEnabled: boolean; transportCharge: string; transportChargeGstRate: string;
  };

  function restoreDraft() {
    const draft = loadFormDraft<InvoiceEditDraft>(DRAFT_KEY);
    if (draft?.values) {
      const v = draft.values;
      setCustomerId(v.customerId);
      setIsInterState(v.isInterState);
      setPlaceOfSupply(v.placeOfSupply);
      setReverseCharge(v.reverseCharge);
      setItems(v.items ?? []);
      setNotes(v.notes ?? "");
      setDueDate(v.dueDate ?? "");
      setInvoiceDate(v.invoiceDate ?? "");
      setTransportChargeEnabled(v.transportChargeEnabled);
      setTransportCharge(v.transportCharge ?? "");
      setTransportChargeGstRate(v.transportChargeGstRate ?? "18");
      const selected = customers.find((c) => c.id === v.customerId);
      if (selected) setCustomerSearch(selected.name);
    }
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

  useFormDraft(DRAFT_KEY, {
    customerId, isInterState, placeOfSupply, reverseCharge, items, notes, dueDate, invoiceDate,
    transportChargeEnabled, transportCharge, transportChargeGstRate,
  }, !draftReady || saving || !isDirty);

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const customerPincodeLookup = usePincodeAutofill((city, state) => {
    setCustomerForm((p) => ({ ...p, city: city || p.city, state: state || p.state }));
    if (city) setCustomerErrors((p) => ({ ...p, city: undefined }));
    if (state) setCustomerErrors((p) => ({ ...p, state: undefined }));
  });

  function updateCustomerField<K extends keyof CustomerForm>(field: K, value: string) {
    setCustomerForm((p) => ({ ...p, [field]: value }));
    setCustomerErrors((p) => ({ ...p, [field]: undefined }));
  }

  function handleCustomerPincodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    updateCustomerField("pincode", digits);
    if (digits.length === 6) customerPincodeLookup.run(digits);
    else customerPincodeLookup.reset();
  }

  const handleCustomerSelect = useCallback((c: Customer) => {
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setPlaceOfSupply(c.state ?? "");
    if (c.state && businessState) setIsInterState(c.state !== businessState);
  }, [businessState]);

  function handleRemoveCustomer() {
    setCustomerId("");
    setCustomerSearch("");
    setShowCustomerDropdown(true);
  }

  function openCustomerCreate() {
    setCustomerEditId(null);
    setCustomerForm(BLANK_CUSTOMER_FORM);
    setCustomerErrors({});
    setDontSaveCustomer(false);
    customerPincodeLookup.reset();
    setCustomerModalOpen(true);
  }

  function openCustomerEdit(c: Customer) {
    setCustomerEditId(c.id);
    setCustomerForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      pincode: c.pincode ?? "",
      gstin: c.gstin ?? "",
    });
    setCustomerErrors({});
    customerPincodeLookup.reset();
    setCustomerModalOpen(true);
  }

  function closeCustomerModal() {
    if (customerSaving) return;
    setCustomerModalOpen(false);
    setCustomerEditId(null);
    setCustomerForm(BLANK_CUSTOMER_FORM);
    setDontSaveCustomer(false);
    customerPincodeLookup.reset();
  }

  function validateCustomerForm(): boolean {
    const errs = validateForm<CustomerForm>(customerForm, {
      name:    [rules.required("Customer name is required."), rules.minLength(2), rules.maxLength(200)],
      phone:   [rules.phone10()],
      email:   [rules.maxLength(254), rules.email()],
      address: [rules.required("Address is required."), rules.minLength(5), rules.maxLength(500)],
      city:    [rules.required("City is required."), rules.minLength(2), rules.maxLength(100)],
      state:   [rules.required("State is required.")],
      pincode: [rules.required("Pincode is required."), rules.pincode()],
      gstin:   [rules.gstin()],
    });
    setCustomerErrors(errs);
    return !hasErrors(errs);
  }

  async function saveCustomerEdit() {
    if (!customerEditId || !validateCustomerForm()) return;
    setCustomerSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerForm.name.trim(),
          phone: customerForm.phone.trim() || null,
          email: customerForm.email.trim() || null,
          address: customerForm.address.trim() || null,
          city: customerForm.city.trim() || null,
          state: customerForm.state.trim() || null,
          pincode: customerForm.pincode.trim() || null,
          gstin: customerForm.gstin.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCustomers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        if (customerId === data.id) setCustomerSearch(data.name);
        bustCachePrefix("/api/customers");
        setCustomerModalOpen(false);
        setCustomerEditId(null);
        setCustomerForm(BLANK_CUSTOMER_FORM);
        toast({ type: "success", title: "Customer updated", message: `${data.name} saved.` });
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to update customer." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setCustomerSaving(false);
  }

  async function saveNewCustomer() {
    if (!validateCustomerForm()) return;
    setCustomerSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerForm.name.trim(),
          phone: customerForm.phone.trim() || null,
          email: customerForm.email.trim() || null,
          address: customerForm.address.trim() || null,
          city: customerForm.city.trim() || null,
          state: customerForm.state.trim() || null,
          pincode: customerForm.pincode.trim() || null,
          gstin: customerForm.gstin.trim() || null,
          oneOff: dontSaveCustomer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCustomers((prev) => [...prev, data]);
        setCustomerId(data.id);
        setCustomerSearch(data.name);
        setPlaceOfSupply(data.state ?? "");
        if (data.state && businessState) setIsInterState(data.state !== businessState);
        if (!dontSaveCustomer) bustCachePrefix("/api/customers");
        setCustomerModalOpen(false);
        setCustomerForm(BLANK_CUSTOMER_FORM);
        setDontSaveCustomer(false);
        toast({
          type: "success", title: "Customer created",
          message: dontSaveCustomer ? `${data.name} added and selected for this invoice only.` : `${data.name} added and selected.`,
        });
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to create customer." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setCustomerSaving(false);
  }

  useEffect(() => {
    Promise.all([
      fetchCached(`/api/invoices/${id}`),
      fetchCached("/api/products?pageSize=5000").catch(() => ({ data: [] })),
      fetchCached("/api/settings").catch(() => null),
      fetchCached("/api/customers?pageSize=5000").catch(() => ({ data: [] })),
    ]).then(([inv, prods, settings, custs]) => {
      const invoice = inv as InvoiceData;
      const products = (prods as { data: Product[] }).data ?? [];
      const customerList = (custs as { data: Customer[] }).data ?? [];
      // The invoice's own customer may be a one-off (soft-deleted) row not returned by /api/customers — keep it visible either way.
      const mergedCustomers = customerList.some((c) => c.id === invoice.customer.id)
        ? customerList
        : [...customerList, invoice.customer];
      setInvoice(invoice);
      setProducts(products);
      setCustomers(mergedCustomers);
      setCustomerId(invoice.customer.id);
      setCustomerSearch(invoice.customer.name);
      setBusinessState((settings as { state?: string } | null)?.state ?? "");
      const inter = invoice.isInterState ?? false;
      const pos = invoice.placeOfSupply ?? invoice.customer.state ?? "";
      const notesVal = invoice.notes ?? "";
      const dueDateVal = invoice.dueDate ? invoice.dueDate.split("T")[0] : "";
      const lineItems: LineItem[] = invoice.items.map((item: InvoiceData["items"][0]) => ({
        key: makeInvoiceLineItemKey(),
        productId: item.productId ?? "",
        productName: item.name,
        unit: item.unit,
        qty: item.quantity,
        price: item.price,
        gstRate: item.gstRate,
        hsn: item.hsn ?? "",
        discountPercent: item.discountPercent ?? 0,
      }));
      const rc = invoice.reverseCharge ?? false;
      const transportChargeVal = invoice.transportCharge && invoice.transportCharge > 0 ? String(invoice.transportCharge) : "";
      const transportChargeGstRateVal = invoice.transportChargeGstRate ? String(invoice.transportChargeGstRate) : "18";
      setIsInterState(inter);
      setPlaceOfSupply(pos);
      setReverseCharge(rc);
      setNotes(notesVal);
      setDueDate(dueDateVal);
      setInvoiceDate(invoice.date ? invoice.date.split("T")[0] : "");
      const transportEnabled = invoice.transportCharge != null && invoice.transportCharge > 0;
      setTransportChargeEnabled(transportEnabled);
      setTransportCharge(transportChargeVal);
      setTransportChargeGstRate(transportChargeGstRateVal);
      setLoadedUpdatedAt(invoice.updatedAt ?? null);
      setItems(lineItems);
      markClean({
        customerId: invoice.customer.id,
        isInterState: inter, placeOfSupply: pos, reverseCharge: rc, items: lineItems, notes: notesVal, dueDate: dueDateVal,
        invoiceDate: invoice.date ? invoice.date.split("T")[0] : "",
        transportChargeEnabled: transportEnabled, transportCharge: transportChargeVal, transportChargeGstRate: transportChargeGstRateVal,
      });
      setLoading(false);
      if (loadFormDraft(`invoice:edit:${id}`)) setShowDraftBanner(true);
      else setDraftReady(true);
    }).catch(() => { setError("Failed to load invoice."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markClean is a fresh function each render (not memoized); only `id` should retrigger this fetch
  }, [id]);

  const effectiveTransportCharge = transportChargeEnabled ? (parseFloat(transportCharge) || 0) : 0;
  const effectiveTransportGstRate = transportChargeEnabled ? (parseFloat(transportChargeGstRate) || 0) : 0;
  const { grossTotal, discountTotal, taxBreakdown, roundOff, grandTotal, transportChargeGstAmount } =
    computeInvoiceTotals(items, effectiveTransportCharge, effectiveTransportGstRate);
  // Once enabled, amount and GST rate are both mandatory — a blank amount must not silently save as zero.
  const missingTransportAmount = transportChargeEnabled && (!transportCharge.trim() || effectiveTransportCharge <= 0);
  const missingTransportGstRate = transportChargeEnabled && !transportChargeGstRate.trim();
  const missingTransportCharge = missingTransportAmount || missingTransportGstRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast({ type: "error", title: "Check form", message: "Select a customer." }); return; }
    if (items.length === 0) { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (!placeOfSupply) { toast({ type: "error", title: "Check form", message: "Select place of supply." }); return; }
    if (invoiceDate && invoiceDate > todayStr) { toast({ type: "error", title: "Check form", message: "Invoice date cannot be in the future." }); return; }
    if (invoiceDate && invoice && getIndianFinancialYear(new Date(invoiceDate)) !== getIndianFinancialYear(new Date(invoice.date))) {
      toast({ type: "error", title: "Check form", message: "Invoice date cannot be moved into a different financial year — it would no longer match the invoice number." });
      return;
    }
    if (dueDate && invoiceDate && dueDate < invoiceDate) { toast({ type: "error", title: "Check form", message: "Due date cannot be before the invoice date." }); return; }
    if (missingTransportAmount) {
      setTransportChargeError("Enter the transport charge amount.");
      toast({ type: "error", title: "Check form", message: "Enter the transport charge amount." });
      return;
    }
    if (missingTransportGstRate) {
      setTransportChargeError("Enter a GST rate for the transport charge.");
      toast({ type: "error", title: "Check form", message: "Enter a GST rate for the transport charge." });
      return;
    }
    setTransportChargeError(undefined);
    for (const item of items) {
      const qtyErr   = validate(String(item.qty),   rules.positiveNumber("Item quantity must be greater than 0."));
      const priceErr = validate(String(item.price), rules.nonNegativeNumber("Item price cannot be negative."));
      if (qtyErr || priceErr) { toast({ type: "error", title: "Check form", message: qtyErr ?? priceErr ?? "" }); return; }
    }

    // product.stock already has this invoice's old qty deducted, so effective available = stock + original qty.
    const outOfStock = items.flatMap(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return [];
      const originalQty = invoice?.items.find(orig => orig.productId === item.productId)?.quantity ?? 0;
      const effectiveStock = product.stock + originalQty;
      if (item.qty > effectiveStock) {
        return [{ name: item.productName, available: effectiveStock, requested: item.qty }];
      }
      return [];
    });
    if (outOfStock.length > 0) {
      setStockOutItems(outOfStock);
      setShowStockDialog(true);
      return;
    }
    await doSubmit();
  }

  async function doSubmit(overrideCreditLimit: boolean = false) {
    setShowStockDialog(false);
    setShowCreditLimitDialog(false);
    setSaving(true);
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        isInterState,
        placeOfSupply,
        reverseCharge,
        items: items.map((i) => ({ productId: i.productId || null, name: i.productName, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit, hsn: i.hsn, discountPercent: i.discountPercent })),
        notes,
        date: invoiceDate || undefined,
        dueDate: dueDate || undefined,
        transportCharge: effectiveTransportCharge,
        transportChargeGstRate: effectiveTransportGstRate,
        expectedUpdatedAt: loadedUpdatedAt,
        ...(overrideCreditLimit ? { overrideCreditLimit: true } : {}),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      clearFormDraft(DRAFT_KEY);
      bustCache(`/api/invoices/${id}`);
      bustCachePrefix("/api/invoices");
      bustCachePrefix("/api/products");
      bustCachePrefix("/api/reports");
      invalidateCachedPdf("invoice", id);
      toast({ type: "success", title: "Invoice updated", message: "Changes saved." });
      if (d.stockWarnings?.length > 0) {
        toast({ type: "warning", title: "Stock went negative", message: d.stockWarnings.join(", ") });
      }
      // saving stays true until navigation completes, so the form can't re-enable and be submitted again mid-transition.
      router.push(`/sales/invoices/${id}`);
      return;
    }
    const d = await res.json().catch(() => ({}));
    if (res.status === 409) {
      bustCache(`/api/invoices/${id}`);
      toast({ type: "error", title: "Update conflict", message: d?.error ?? "This invoice was changed by someone else. Please reload and try again." });
      setSaving(false);
      return;
    }
    if (res.status === 422 && d?.code === "CREDIT_LIMIT_EXCEEDED") {
      setCreditLimitMessage(d.error ?? "This change would exceed the customer's credit limit.");
      setShowCreditLimitDialog(true);
      setSaving(false);
      return;
    }
    toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update invoice." });
    setSaving(false);
  }

  if (loading) return (
    <div className="page-stack">
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <Sk w={220} h={14} />
      <div className={`card ${styles.skCard}`}>
        <Sk w={160} h={13} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skItemRow}>
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk w={28} h={28} r={6} />
          </div>
        ))}
        <Sk w={120} h={32} r={8} />
      </div>
      <div className={styles.skGrid}>
        <div className={`card ${styles.skSummaryCard}`}>
          <Sk w={100} h={13} />
          <Sk h={80} r={8} />
        </div>
        <div className={`card ${styles.skSummaryCard}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skSummaryRow}>
              <Sk w="40%" h={13} />
              <Sk w="30%" h={13} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (error && !invoice) return <div className={`loading-center ${styles.errorCenter}`}>{error}</div>;
  if (!invoice) return null;

  // A fully paid invoice is reachable directly by URL even though list/detail Edit buttons are disabled — guard here too.
  if (invoice.status === "paid") {
    return (
      <div className="page-stack">
        <Breadcrumb items={[
          { label: "Invoices", href: "/sales/invoices" },
          { label: invoice.invoiceNumber, href: `/sales/invoices/${id}` },
          { label: "Edit" },
        ]} />
        <div className={`error-banner ${styles.errorCenter}`}>
          This invoice is fully paid and cannot be edited.
        </div>
        <div className="form-actions">
          <Button variant="secondary" href={`/sales/invoices/${id}`}>← Back to Invoice</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving invoice…" />}

    <ConfirmDialog
      open={showStockDialog}
      title="Items out of stock"
      message="The following items don't have enough stock. Do you still want to update the invoice?"
      detail={
        <div className={styles.stockDialog}>
          <div className={styles.stockDialogHeader}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className={styles.stockDialogHeaderText}>Insufficient stock</span>
          </div>
          <div className={styles.stockDialogBody}>
            {stockOutItems.map((item, i) => (
              <div key={i} className={`${styles.stockDialogRow} ${i % 2 === 0 ? styles.stockDialogRowAlt : ""}`}>
                <span className={styles.stockDialogRowName}>{item.name}</span>
                <span className={styles.stockDialogRowMeta}>
                  Have <strong>{item.available}</strong> · Need <strong>{item.requested}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      confirmLabel="Update Anyway"
      cancelLabel="Go Back"
      variant="danger"
      loading={saving}
      onConfirm={() => doSubmit()}
      onCancel={() => setShowStockDialog(false)}
    />

    <ConfirmDialog
      open={showCreditLimitDialog}
      title="Credit limit exceeded"
      message={creditLimitMessage}
      confirmLabel="Update Anyway"
      cancelLabel="Go Back"
      variant="danger"
      loading={saving}
      onConfirm={() => doSubmit(true)}
      onCancel={() => setShowCreditLimitDialog(false)}
    />

    <div className="page-stack">
      <Breadcrumb items={[
        { label: "Invoices", href: "/sales/invoices" },
        { label: invoice.invoiceNumber, href: `/sales/invoices/${id}` },
        { label: "Edit" },
      ]} />
      <div>
        <h1 className="page-title">Edit Invoice — {invoice.invoiceNumber}</h1>
        <p className="page-sub">Editing is allowed only while the invoice is unpaid or partially paid.</p>
      </div>
      <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.layout}>
          {/* Left column */}
          <div className={styles.leftCol}>
            {showDraftBanner && (
              <InfoBanner
                message="You have unsaved edits to this invoice from earlier — want to resume them?"
                actionLabel="Resume draft"
                onAction={restoreDraft}
                onDismiss={dismissDraft}
              />
            )}
            {/* Customer */}
            {(() => {
              const section = animateSection(0, `card ${styles.sectionCard}`);
              return (
                <div
                  className={section.className}
                  style={{ ...section.style, position: "relative", zIndex: showCustomerDropdown ? 5 : "auto" }}
                >
              <div className={styles.billToHeaderRow}>
                <h2 className={styles.sectionTitle}>Bill To</h2>
              </div>

              {selectedCustomer ? (
                <div className={styles.customSummary}>
                  <div className={styles.selectedCustomer}>
                    <div className={styles.selectedCustomerName} title={selectedCustomer.name}>{selectedCustomer.name}</div>
                    <div className={styles.selectedCustomerSub}>
                      {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                      {selectedCustomer.gstin && ` · GSTIN: ${selectedCustomer.gstin}`}
                    </div>
                  </div>
                  <div className={styles.customSummaryActions}>
                    <button type="button" onClick={() => openCustomerEdit(selectedCustomer)} className={styles.billToEditLink}>Edit</button>
                    <button type="button" onClick={handleRemoveCustomer} className={styles.removeCustomLink}>Remove</button>
                  </div>
                </div>
              ) : (
                <div className={styles.searchWrap}>
                  <Input
                    type="text"
                    placeholder="Search customer…"
                    autoFocus
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                    onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                  />
                  {showCustomerDropdown && (
                    <div className={styles.dropdown} onMouseDown={(e) => e.preventDefault()}>
                      {filteredCustomers.length > 0 ? filteredCustomers.map((c) => (
                        <button key={c.id} type="button" onClick={() => handleCustomerSelect(c)} className={styles.dropdownBtn}>
                          <div className={styles.dropdownItemName} title={c.name}>{c.name}</div>
                          <div className={styles.dropdownItemSub}>{c.city}{c.gstin ? ` · ${c.gstin}` : ""}</div>
                        </button>
                      )) : (
                        <div className={styles.dropdownEmpty}>No customer found.</div>
                      )}
                    </div>
                  )}
                  {!showCustomerDropdown && (
                    <button type="button" onClick={openCustomerCreate} className={styles.addCustomerLink}>
                      + Add new customer manually
                    </button>
                  )}
                </div>
              )}
                </div>
              );
            })()}

            <Modal
              open={customerModalOpen}
              onClose={closeCustomerModal}
              title={customerEditId ? "Edit Customer" : "Add New Customer"}
              subtitle={customerEditId ? "Update this customer's details" : "Not in your list — fill details and create"}
              variant="fullscreen"
              footer={
                <>
                  <Button type="button" variant="secondary" disabled={customerSaving} onClick={closeCustomerModal}>Cancel</Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={customerSaving}
                    disabled={customerSaving || !customerForm.name.trim() || !customerForm.address.trim() || !customerForm.city.trim() || !customerForm.state.trim() || !customerForm.pincode.trim()}
                    onClick={() => { if (customerEditId) saveCustomerEdit(); else saveNewCustomer(); }}
                  >
                    {customerEditId ? "Save Changes" : (dontSaveCustomer ? "Use For This Invoice Only" : "Save & Use This Customer")}
                  </Button>
                </>
              }
            >
              <div className={styles.customForm}>
                <FormField label="Customer Name" required error={customerErrors.name}>
                  <Input autoFocus value={customerForm.name} onChange={(e) => updateCustomerField("name", e.target.value)} placeholder="e.g. Acme Traders" maxLength={200} />
                </FormField>
                <FormField label="Address" required error={customerErrors.address}>
                  <Input value={customerForm.address} onChange={(e) => updateCustomerField("address", e.target.value)} placeholder="Street / locality" maxLength={500} />
                </FormField>
                <div className="form-grid-2">
                  <FormField
                    label="Pincode"
                    required
                    error={customerErrors.pincode}
                    hint={customerPincodeLookup.status.status === "loading" ? "Looking up city/state…" : customerPincodeLookup.status.label}
                    hintSuccess={customerPincodeLookup.status.status === "found"}
                  >
                    <Input inputMode="numeric" value={customerForm.pincode} onChange={(e) => handleCustomerPincodeChange(e.target.value)} placeholder="6-digit" maxLength={6} />
                  </FormField>
                  <FormField label="State" required error={customerErrors.state}>
                    <Select value={customerForm.state} onChange={(e) => updateCustomerField("state", e.target.value)}>
                      <option value="">Select state</option>
                      {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </FormField>
                </div>
                <div className="form-grid-2">
                  <FormField label="City" required error={customerErrors.city}>
                    <Input value={customerForm.city} onChange={(e) => updateCustomerField("city", e.target.value)} placeholder="City" maxLength={100} />
                  </FormField>
                  <FormField label="GSTIN" error={customerErrors.gstin}>
                    <Input value={customerForm.gstin} onChange={(e) => updateCustomerField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" maxLength={15} mono />
                  </FormField>
                </div>
                <div className="form-grid-2">
                  <FormField label="Phone" error={customerErrors.phone}>
                    <PhoneInput value={customerForm.phone} onChange={(e) => updateCustomerField("phone", e.target.value)} placeholder="10-digit mobile" />
                  </FormField>
                  <FormField label="Email" error={customerErrors.email}>
                    <Input type="email" value={customerForm.email} onChange={(e) => updateCustomerField("email", e.target.value)} placeholder="customer@example.com" maxLength={254} />
                  </FormField>
                </div>
                {!customerEditId && (
                  <label className={styles.customFormCheckbox}>
                    <input
                      type="checkbox"
                      checked={dontSaveCustomer}
                      onChange={(e) => setDontSaveCustomer(e.target.checked)}
                    />
                    Just for this invoice — don&apos;t save to my customer list
                  </label>
                )}
              </div>
            </Modal>

            {/* Place of supply + inter-state + due date */}
            <InvoiceOptionsRow
              sectionIndex={1}
              placeOfSupply={placeOfSupply}
              onPlaceOfSupplyChange={(state) => {
                setPlaceOfSupply(state);
                if (state && businessState) setIsInterState(state !== businessState);
              }}
              isInterState={isInterState}
              onToggleInterState={() => setIsInterState((v) => !v)}
              reverseCharge={reverseCharge}
              onToggleReverseCharge={() => setReverseCharge((v) => !v)}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              minDueDate={invoiceDate || undefined}
              invoiceDate={invoiceDate}
              onInvoiceDateChange={setInvoiceDate}
              maxInvoiceDate={todayStr}
              transportChargeEnabled={transportChargeEnabled}
              onToggleTransportCharge={() => { setTransportChargeEnabled((v) => !v); setTransportChargeError(undefined); }}
              transportCharge={transportCharge}
              onTransportChargeChange={(v) => { setTransportCharge(v); setTransportChargeError(undefined); }}
              transportChargeGstRate={transportChargeGstRate}
              onTransportChargeGstRateChange={(v) => { setTransportChargeGstRate(v); setTransportChargeError(undefined); }}
              transportChargeError={transportChargeError}
            />

            {/* Items */}
            <InvoiceLineItemsCard
              sectionIndex={2}
              products={products}
              setProducts={setProducts}
              items={items}
              setItems={setItems}
            />

            {/* Notes */}
            <div {...animateSection(3, `card ${styles.sectionCard}`)}>
              <FormField label="Notes / Terms">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment terms, delivery instructions…"
                  maxLength={2000}
                />
              </FormField>
            </div>
          </div>

          {/* Right — summary */}
          <div className={styles.rightCol}>
            <div {...animateSection(4, `card ${styles.summaryCard}`)}>
              <h2 className={styles.summaryTitle}>Invoice Summary</h2>
              <div className={styles.summaryList}>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>₹{grossTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {discountTotal > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Discount</span>
                    <span className={styles.discountValue}>−₹{discountTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {Object.entries(taxBreakdown).map(([rate, amt]) =>
                  isInterState ? (
                    <div key={rate} className={styles.summaryRow}>
                      <span>IGST {rate}%</span>
                      <span>₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div key={rate} className={styles.summaryGstGroup}>
                      <div className={styles.summaryRow}>
                        <span>CGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className={styles.summaryRow}>
                        <span>SGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                )}
                {effectiveTransportCharge > 0 && (
                  <>
                    <div className={styles.summaryRow}>
                      <span>Transport Charge</span>
                      <span>₹{effectiveTransportCharge.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {transportChargeGstAmount > 0 && (
                      isInterState ? (
                        <div className={styles.summaryRow}>
                          <span>Transport IGST {effectiveTransportGstRate}%</span>
                          <span>₹{transportChargeGstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ) : (
                        <div className={styles.summaryGstGroup}>
                          <div className={styles.summaryRow}>
                            <span>Transport CGST {effectiveTransportGstRate / 2}%</span>
                            <span>₹{(transportChargeGstAmount / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className={styles.summaryRow}>
                            <span>Transport SGST {effectiveTransportGstRate / 2}%</span>
                            <span>₹{(transportChargeGstAmount / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
                {roundOff !== 0 && (
                  <div className={styles.summaryRow}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? "+" : "−"}₹{Math.abs(roundOff).toFixed(2)}</span>
                  </div>
                )}
                <div className={styles.summaryTotalRow}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              {!customerId && (
                <p className={styles.summaryHint}>• Select a customer</p>
              )}
              {items.length === 0 && (
                <p className={styles.summaryHint}>• Add at least one item</p>
              )}
              {!placeOfSupply && items.length > 0 && (
                <p className={styles.summaryHint}>• Select place of supply</p>
              )}
              {missingTransportAmount && (
                <p className={styles.summaryHint}>• Enter the transport charge amount</p>
              )}
              {!missingTransportAmount && missingTransportGstRate && (
                <p className={styles.summaryHint}>• Enter a GST rate for the transport charge</p>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  disabled={saving || items.length === 0 || !placeOfSupply || !customerId || !isDirty || missingTransportCharge}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Invoice
                </Button>
                {!isDirty && items.length > 0 && !saving && (
                  <p className={styles.noChangesHint}>No changes detected.</p>
                )}
                <Button variant="secondary" href={`/sales/invoices/${id}`} size="full">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
    </>
  );
}
