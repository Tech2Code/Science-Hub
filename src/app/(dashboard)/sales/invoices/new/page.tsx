"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import { InvoiceOptionsRow } from "@/components/invoices/InvoiceOptionsRow";
import { InvoiceLineItemsCard } from "@/components/invoices/InvoiceLineItemsCard";
import { computeInvoiceTotals, type InvoiceLineItem, type InvoiceProduct } from "@/lib/invoiceCalc";
import styles from "./new.module.css";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate, validateForm, hasErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useDirty } from "@/lib/useDirty";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { deriveDefaultPrefix, getIndianFinancialYear, formatFinancialYearLabel, resolveNumberFormat } from "@/lib/documentNumbering";

// Shown once, only before this business's very first invoice, if numbering
// hasn't been customized yet in Settings — see handling in the mount effect
// below. Dismissing (or simply creating the invoice) hides it for good.
const FIRST_INVOICE_NUDGE_DISMISSED_KEY = "sciencehub_first_invoice_nudge_dismissed";

interface Customer {
  id: string; name: string; city: string; state: string; gstin: string;
  phone?: string | null; email?: string | null; address?: string | null; pincode?: string | null;
}
type Product = InvoiceProduct;
type LineItem = InvoiceLineItem;

export default function NewInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customCustomer, setCustomCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [dontSaveCustomer, setDontSaveCustomer] = useState(false);
  const [customerEditId, setCustomerEditId] = useState<string | null>(null);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  // Defaults off — checked against real usage data (2026-08-18): only ~5% of
  // existing invoices actually carry a transport charge, so defaulting it on
  // forced an extra "toggle off" step on the overwhelming majority of new
  // invoices instead of saving a click as originally intended.
  const [transportChargeEnabled, setTransportChargeEnabled] = useState(false);
  const [transportCharge, setTransportCharge] = useState("");
  const [transportChargeGstRate, setTransportChargeGstRate] = useState("18");
  const [transportChargeError, setTransportChargeError] = useState<string | undefined>(undefined);
  const [customErrors, setCustomErrors] = useState<Partial<Record<keyof typeof customCustomer, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);
  const [showFirstInvoiceNudge, setShowFirstInvoiceNudge] = useState(false);
  const [firstInvoicePreviewNumber, setFirstInvoicePreviewNumber] = useState("");

  const DRAFT_KEY = "invoice:new";
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    const draft = loadFormDraft<{
      customerId: string; customerSearch: string; isInterState: boolean; placeOfSupply: string;
      reverseCharge: boolean; items: LineItem[]; notes: string; dueDate: string;
      transportChargeEnabled: boolean; transportCharge: string; transportChargeGstRate: string;
    }>(DRAFT_KEY);
    const v = draft?.values;
    const hasContent = !!v && (!!v.customerId || !!v.customerSearch?.trim() || v.items?.length > 0 || !!v.notes?.trim());
    if (hasContent) setShowDraftBanner(true);
    else setDraftReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount check
  }, []);

  function restoreDraft() {
    const draft = loadFormDraft<{
      customerId: string; customerSearch: string; isInterState: boolean; placeOfSupply: string;
      reverseCharge: boolean; items: LineItem[]; notes: string; dueDate: string;
      transportChargeEnabled: boolean; transportCharge: string; transportChargeGstRate: string;
    }>(DRAFT_KEY);
    if (draft?.values) {
      const v = draft.values;
      setCustomerId(v.customerId ?? "");
      setCustomerSearch(v.customerSearch ?? "");
      setIsInterState(!!v.isInterState);
      setPlaceOfSupply(v.placeOfSupply ?? "");
      setReverseCharge(!!v.reverseCharge);
      setItems(v.items ?? []);
      setNotes(v.notes ?? "");
      setDueDate(v.dueDate ?? "");
      setTransportChargeEnabled(v.transportChargeEnabled ?? true);
      setTransportCharge(v.transportCharge ?? "");
      setTransportChargeGstRate(v.transportChargeGstRate ?? "18");
    }
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  function dismissDraft() {
    clearFormDraft(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  useFormDraft(DRAFT_KEY, {
    customerId, customerSearch, isInterState, placeOfSupply, reverseCharge,
    items, notes, dueDate, transportChargeEnabled, transportCharge, transportChargeGstRate,
  }, !draftReady || saving);

  useEffect(() => {
    fetch("/api/customers?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((res: { data: Customer[] }) => {
      const all = res.data ?? [];
      setCustomers(all);
      const prefillId = searchParams.get("customerId");
      if (prefillId) {
        const found = all.find((c) => c.id === prefillId);
        if (found) {
          setCustomerId(found.id);
          setCustomerSearch(found.name);
        }
      }
    }).catch(() => {});
    fetch("/api/products?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((res: { data: Product[] }) => setProducts(res.data ?? [])).catch(() => {});
    fetch("/api/settings", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((s) => {
      setBusinessState(s?.state ?? "");
      const numberingUntouched = !s?.invoiceNumberPrefix && !s?.nextInvoiceNumberOverride && !s?.invoiceNumberFormat;
      if (!numberingUntouched || localStorage.getItem(FIRST_INVOICE_NUDGE_DISMISSED_KEY)) return;
      const prefix = deriveDefaultPrefix(s?.name || "Science Hub");
      const fyLabel = formatFinancialYearLabel(getIndianFinancialYear(new Date()));
      setFirstInvoicePreviewNumber(resolveNumberFormat(s?.invoiceNumberFormat).render(prefix, fyLabel, 1));
      fetch("/api/invoices?page=1&pageSize=1", { headers: { "x-no-loader": "1" } })
        .then((r) => r.json())
        .then((res: { total?: number }) => { if ((res.total ?? 0) === 0) setShowFirstInvoiceNudge(true); })
        .catch(() => {});
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount prefill from the initial URL, not meant to re-run on searchParams changes
  }, []);

  function dismissFirstInvoiceNudge() {
    localStorage.setItem(FIRST_INVOICE_NUDGE_DISMISSED_KEY, "1");
    setShowFirstInvoiceNudge(false);
  }

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customCustomerDirty = useDirty(customCustomer);

  function applyPlaceOfSupply(state: string) {
    setPlaceOfSupply(state);
    if (state && businessState) setIsInterState(state !== businessState);
  }

  const customPincodeLookup = usePincodeAutofill((city, state) => {
    setCustomCustomer((p) => ({ ...p, city: city || p.city, state: state || p.state }));
    if (city) clearErr("city");
    if (state) { clearErr("state"); applyPlaceOfSupply(state); }
  });

  function handleCustomPincodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCustomCustomer((p) => ({ ...p, pincode: digits }));
    clearErr("pincode");
    if (digits.length === 6) customPincodeLookup.run(digits);
    else customPincodeLookup.reset();
  }

  const handleCustomerSelect = useCallback((c: Customer) => {
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
    setDontSaveCustomer(false);
    setCustomModalOpen(false);
    customPincodeLookup.reset();
    setPlaceOfSupply(c.state ?? "");
    if (c.state && businessState) setIsInterState(c.state !== businessState);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset() only bumps a ref/idle-state, stable in effect though the hook returns a new object each render
  }, [businessState]);

  function openCustomerCreate() {
    setCustomerId("");
    setCustomerSearch("");
    setShowCustomerDropdown(false);
    setCustomerEditId(null);
    setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
    setDontSaveCustomer(false);
    setCustomErrors({});
    customPincodeLookup.reset();
    setCustomModalOpen(true);
  }

  function openCustomerEdit(c: Customer) {
    const snapshot = {
      name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "",
      city: c.city ?? "", state: c.state ?? "", pincode: c.pincode ?? "", gstin: c.gstin ?? "",
    };
    setCustomerEditId(c.id);
    setCustomCustomer(snapshot);
    customCustomerDirty.markClean(snapshot);
    setCustomErrors({});
    setCustomModalOpen(true);
    customPincodeLookup.reset();
  }

  async function saveCustomerEdit() {
    if (!customerEditId || !validateCustomCustomer()) return;
    setCustomerSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customCustomer.name.trim(),
          phone: customCustomer.phone.trim() || null,
          email: customCustomer.email.trim() || null,
          address: customCustomer.address.trim() || null,
          city: customCustomer.city.trim() || null,
          state: customCustomer.state.trim() || null,
          pincode: customCustomer.pincode.trim() || null,
          gstin: customCustomer.gstin.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        setCustomerSearch(data.name);
        applyPlaceOfSupply(data.state ?? "");
        bustCachePrefix("/api/customers");
        setCustomerEditId(null);
        setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
        setCustomModalOpen(false);
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
    if (!validateCustomCustomer()) return;
    setCustomerSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customCustomer.name.trim(),
          phone: customCustomer.phone.trim() || null,
          email: customCustomer.email.trim() || null,
          address: customCustomer.address.trim() || null,
          city: customCustomer.city.trim() || null,
          state: customCustomer.state.trim() || null,
          pincode: customCustomer.pincode.trim() || null,
          gstin: customCustomer.gstin.trim() || null,
          oneOff: dontSaveCustomer,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomers((prev) => [...prev, data]);
        setCustomerId(data.id);
        setCustomerSearch(data.name);
        applyPlaceOfSupply(data.state ?? "");
        setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
        setCustomModalOpen(false);
        if (!dontSaveCustomer) bustCachePrefix("/api/customers");
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

  const effectiveTransportCharge = transportChargeEnabled ? (parseFloat(transportCharge) || 0) : 0;
  const effectiveTransportGstRate = transportChargeEnabled ? (parseFloat(transportChargeGstRate) || 0) : 0;
  const { grossTotal, discountTotal, taxBreakdown, roundOff, grandTotal, transportChargeGstAmount } =
    computeInvoiceTotals(items, effectiveTransportCharge, effectiveTransportGstRate);
  // Once the transport charge toggle is on, both the amount and the GST rate
  // are mandatory — leaving the amount blank must not silently save a
  // zero-value transport charge.
  const missingTransportAmount = transportChargeEnabled && (!transportCharge.trim() || effectiveTransportCharge <= 0);
  const missingTransportGstRate = transportChargeEnabled && !transportChargeGstRate.trim();
  const missingTransportCharge = missingTransportAmount || missingTransportGstRate;

  function validateCustomCustomer(): boolean {
    const errs = validateForm(customCustomer, {
      name:    [rules.required("Customer name is required."), rules.minLength(2), rules.maxLength(200)],
      phone:   [rules.phone10()],
      email:   [rules.maxLength(254), rules.email()],
      address: [rules.required("Address is required."), rules.minLength(5), rules.maxLength(500)],
      city:    [rules.required("City is required."), rules.minLength(2), rules.maxLength(100)],
      state:   [rules.required("State is required.")],
      pincode: [rules.required("Pincode is required."), rules.pincode()],
      gstin:   [rules.gstin()],
    });
    setCustomErrors(errs);
    return !hasErrors(errs);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast({ type: "error", title: "Check form", message: "Select a customer." }); return; }
    if (items.length === 0) { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (!placeOfSupply) { toast({ type: "error", title: "Check form", message: "Select place of supply." }); return; }
    if (dueDate && dueDate < todayStr) { toast({ type: "error", title: "Check form", message: "Due date cannot be in the past." }); return; }
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

    // Check stock before submitting
    const outOfStock = items.flatMap(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product || item.qty <= product.stock) return [];
      return [{ name: item.productName, available: product.stock, requested: item.qty }];
    });
    if (outOfStock.length > 0) {
      setStockOutItems(outOfStock);
      setShowStockDialog(true);
      return;
    }
    await doSubmit();
  }

  async function doSubmit() {
    setShowStockDialog(false);
    setSaving(true);
    const body: Record<string, unknown> = {
      isInterState,
      placeOfSupply,
      reverseCharge,
      items: items.map((i) => ({ productId: i.productId || null, name: i.productName, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit, hsn: i.hsn, discountPercent: i.discountPercent })),
      notes, dueDate: dueDate || undefined,
      customerId,
      transportCharge: effectiveTransportCharge,
      transportChargeGstRate: effectiveTransportGstRate,
    };
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json();
      clearFormDraft(DRAFT_KEY);
      bustCachePrefix("/api/invoices");
      bustCachePrefix("/api/reports");
      bustCachePrefix("/api/products");
      toast({ type: "success", title: "Invoice created", message: "Invoice saved successfully." });
      if (d.stockWarnings?.length > 0) {
        toast({ type: "warning", title: "Stock went negative", message: d.stockWarnings.join(", ") });
      }
      // Deliberately not resetting `saving` here — see the edit page for why:
      // it must stay locked until navigation actually replaces this page.
      router.push(`/sales/invoices/${d.id}`);
      return;
    }
    { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to create invoice." }); }
    setSaving(false);
  }

  const clearErr = (field: keyof typeof customCustomer) => {
    if (customErrors[field]) setCustomErrors((p) => ({ ...p, [field]: undefined }));
  };

  return (
    <>
    {saving && <OverlayLoader text="Creating invoice…" />}
    {customerSaving && <OverlayLoader text="Saving customer…" />}
    <div className="page-stack">
      <Breadcrumb items={[{ label: "Invoices", href: "/sales/invoices" }, { label: "New Invoice" }]} />
      <div>
        <h1 className="page-title">Create Invoice</h1>
        <p className="page-sub">Generate a GST-compliant invoice</p>
      </div>
      {showDraftBanner && (
        <InfoBanner
          message="You have an unsaved invoice draft from earlier — want to resume it?"
          actionLabel="Resume draft"
          onAction={restoreDraft}
          onDismiss={dismissDraft}
        />
      )}
      {showFirstInvoiceNudge && (
        <InfoBanner
          message={`This is your first invoice — it will be numbered "${firstInvoicePreviewNumber}" by default. Want a different prefix or starting number?`}
          actionHref="/settings#numbering"
          actionLabel="Customize in Settings →"
          onDismiss={dismissFirstInvoiceNudge}
        />
      )}
      <ConfirmDialog
        open={showCancelConfirm}
        title="Discard this invoice?"
        message="You have unsaved data — customer, items, or notes. If you leave now, everything will be lost."
        confirmLabel="Discard & Leave"
        variant="danger"
        loading={false}
        onConfirm={() => { clearFormDraft(DRAFT_KEY); router.push("/sales/invoices"); }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <ConfirmDialog
        open={showStockDialog}
        title="Items out of stock"
        message="The following items don't have enough stock. Do you still want to create the invoice?"
        detail={
          <div className={styles.stockDetail}>
            <div className={styles.stockDetailHeader}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className={styles.stockDetailHeaderText}>Insufficient stock</span>
            </div>
            <div className={styles.stockDetailList}>
              {stockOutItems.map((item, i) => (
                <div
                  key={i}
                  className={`${i < stockOutItems.length - 1 ? styles.stockDetailRow : styles.stockDetailRowLast}${i % 2 === 0 ? ` ${styles.stockDetailRowAlt}` : ""}`}
                >
                  <span className={styles.stockDetailName}>{item.name}</span>
                  <span className={styles.stockDetailQty}>
                    have <strong>{item.available}</strong> · need <strong>{item.requested}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        }
        confirmLabel="Create Anyway"
        cancelLabel="Go Back"
        variant="danger"
        loading={saving}
        onConfirm={doSubmit}
        onCancel={() => setShowStockDialog(false)}
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.layout}>
          {/* Left column */}
          <div className={styles.leftCol}>
            {/* Customer selector */}
            {(() => {
              const section = animateSection(0, `card ${styles.cardPad}`);
              return (
                <div
                  className={section.className}
                  style={{ ...section.style, position: "relative", zIndex: showCustomerDropdown ? 5 : "auto" }}
                >
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionTitle}>Bill To</h2>
              </div>

              <div className={styles.searchWrap}>
                <Input
                  type="text"
                  placeholder="Search customer…"
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
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
                      <div className={styles.dropdownEmpty}>
                        No customer found.{" "}
                        <Link href="/sales/customers/new" className={styles.dropdownEmptyLink}>Add new →</Link>
                      </div>
                    )}
                  </div>
                )}
                {customerSearch && !customerId && (
                  <p className={styles.selectHint}>
                    ⚠ Please select a customer from the dropdown
                  </p>
                )}
                {!customerId && !showCustomerDropdown && (
                  <button
                    type="button"
                    onClick={openCustomerCreate}
                    className={styles.addCustomerLink}
                  >
                    + Add new customer manually
                  </button>
                )}
              </div>

              {selectedCustomer && (
                <div className={styles.customSummary}>
                  <div className={styles.selectedCustomer}>
                    <div className={styles.selectedCustomerName}>{selectedCustomer.name}</div>
                    <div className={styles.selectedCustomerSub}>
                      {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                      {selectedCustomer.gstin && ` · GSTIN: ${selectedCustomer.gstin}`}
                    </div>
                  </div>
                  <div className={styles.customSummaryActions}>
                    <button type="button" onClick={() => openCustomerEdit(selectedCustomer)} className={styles.dropdownEmptyLink}>Edit</button>
                    <button
                      type="button"
                      onClick={() => { setCustomerId(""); setCustomerSearch(""); }}
                      className={styles.removeCustomLink}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

                </div>
              );
            })()}

            <Modal
              open={customModalOpen}
              onClose={() => {
                if (customerSaving) return;
                setCustomModalOpen(false);
                applyPlaceOfSupply(customerEditId ? (selectedCustomer?.state ?? "") : "");
                setCustomerEditId(null);
                setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
                customPincodeLookup.reset();
              }}
              title={customerEditId ? "Edit Customer" : "Add New Customer"}
              subtitle={customerEditId ? "Update this customer's details" : "Not in your list — fill details and create"}
              variant="fullscreen"
              footer={
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={customerSaving}
                    onClick={() => {
                      // The State field's onChange live-updates placeOfSupply
                      // as a preview even while editing — if the user abandons
                      // the draft, put placeOfSupply back to where it actually
                      // belongs: blank for an unsaved "add new customer" draft,
                      // or the still-selected customer's real state when editing.
                      applyPlaceOfSupply(customerEditId ? (selectedCustomer?.state ?? "") : "");
                      setCustomerEditId(null);
                      setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
                      setDontSaveCustomer(false);
                      setCustomModalOpen(false);
                      customPincodeLookup.reset();
                    }}
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={
                      customerSaving ||
                      (!!customerEditId && !customCustomerDirty.isDirty)
                    }
                    onClick={() => { if (customerEditId) saveCustomerEdit(); else saveNewCustomer(); }}
                  >
                    <span className={styles.customModalSubmitLabel}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {customerEditId
                        ? (customerSaving ? "Saving…" : "Save Changes")
                        : (customerSaving ? "Saving…" : dontSaveCustomer ? "Use For This Invoice Only" : "Save & Use This Customer")}
                    </span>
                  </Button>
                </>
              }
            >
              <div className={styles.customForm}>
                <FormField label="Customer Name" required error={customErrors.name}>
                  <Input
                    type="text" placeholder="e.g. Acme Traders"
                    autoFocus
                    value={customCustomer.name}
                    onChange={(e) => { setCustomCustomer((p) => ({ ...p, name: e.target.value })); clearErr("name"); }}
                    maxLength={200}
                  />
                </FormField>
                <FormField label="Address" required error={customErrors.address}>
                  <Input type="text" placeholder="Street / locality" value={customCustomer.address}
                    onChange={(e) => { setCustomCustomer((p) => ({ ...p, address: e.target.value })); clearErr("address"); }} maxLength={500} />
                </FormField>
                <div className="form-grid-2">
                  <FormField
                    label="Pincode"
                    required
                    error={customErrors.pincode}
                    hint={customPincodeLookup.status.status === "loading" ? "Looking up city/state…" : customPincodeLookup.status.label}
                    hintSuccess={customPincodeLookup.status.status === "found"}
                  >
                    <Input type="text" placeholder="6-digit" value={customCustomer.pincode} onChange={handleCustomPincodeChange} maxLength={6} />
                  </FormField>
                  <FormField label="State" required error={customErrors.state}>
                    <Select value={customCustomer.state}
                      onChange={(e) => {
                        const state = e.target.value;
                        setCustomCustomer((p) => ({ ...p, state }));
                        applyPlaceOfSupply(state);
                        clearErr("state");
                      }}
                    >
                      <option value="">Select state</option>
                      {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </FormField>
                </div>
                <div className="form-grid-2">
                  <FormField label="City" required error={customErrors.city}>
                    <Input type="text" placeholder="City" value={customCustomer.city}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, city: e.target.value })); clearErr("city"); }} maxLength={100} />
                  </FormField>
                  <FormField label="GSTIN" error={customErrors.gstin}>
                    <Input type="text" placeholder="22AAAAA0000A1Z5" value={customCustomer.gstin} maxLength={15} mono
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, gstin: e.target.value })); clearErr("gstin"); }} />
                  </FormField>
                </div>
                <div className="form-grid-2">
                  <FormField label="Phone" error={customErrors.phone}>
                    <PhoneInput value={customCustomer.phone} placeholder="10-digit mobile"
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, phone: e.target.value })); clearErr("phone"); }} />
                  </FormField>
                  <FormField label="Email" error={customErrors.email}>
                    <Input type="email" placeholder="customer@example.com" value={customCustomer.email}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, email: e.target.value })); clearErr("email"); }} maxLength={254} />
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

            {/* Place of supply + inter-state toggle + due date */}
            <InvoiceOptionsRow
              sectionIndex={1}
              placeOfSupply={placeOfSupply}
              onPlaceOfSupplyChange={applyPlaceOfSupply}
              isInterState={isInterState}
              onToggleInterState={() => setIsInterState((v) => !v)}
              reverseCharge={reverseCharge}
              onToggleReverseCharge={() => setReverseCharge((v) => !v)}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              minDueDate={todayStr}
              transportChargeEnabled={transportChargeEnabled}
              onToggleTransportCharge={() => { setTransportChargeEnabled((v) => !v); setTransportChargeError(undefined); }}
              transportCharge={transportCharge}
              onTransportChargeChange={(v) => { setTransportCharge(v); setTransportChargeError(undefined); }}
              transportChargeGstRate={transportChargeGstRate}
              onTransportChargeGstRateChange={(v) => { setTransportChargeGstRate(v); setTransportChargeError(undefined); }}
              transportChargeError={transportChargeError}
            />

            {/* Line items */}
            <InvoiceLineItemsCard
              sectionIndex={2}
              products={products}
              setProducts={setProducts}
              items={items}
              setItems={setItems}
            />

            {/* Notes */}
            <div {...animateSection(3, `card ${styles.cardPad}`)}>
              <FormField label="Notes / Terms">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment terms, delivery instructions, or any other notes…"
                  maxLength={2000}
                />
              </FormField>
            </div>
          </div>

          {/* Right — summary */}
          <div className={styles.rightCol}>
            <div {...animateSection(4, `card ${styles.summaryCard}`)}>
              <h2 className={styles.summaryHeading}>Invoice Summary</h2>
              <div className={styles.summaryList}>
                <div className={styles.summaryLine}>
                  <span>Subtotal</span>
                  <span>₹{grossTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {discountTotal > 0 && (
                  <div className={styles.summaryLine}>
                    <span>Discount</span>
                    <span className={styles.warningItem}>−₹{discountTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {Object.entries(taxBreakdown).map(([rate, amt]) =>
                  isInterState ? (
                    <div key={rate} className={styles.summaryLine}>
                      <span>IGST {rate}%</span>
                      <span>₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div key={rate} className={styles.summaryGroup}>
                      <div className={styles.summaryLine}>
                        <span>CGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className={styles.summaryLine}>
                        <span>SGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                )}
                {effectiveTransportCharge > 0 && (
                  <>
                    <div className={styles.summaryLine}>
                      <span>Transport Charge</span>
                      <span>₹{effectiveTransportCharge.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {transportChargeGstAmount > 0 && (
                      isInterState ? (
                        <div className={styles.summaryLine}>
                          <span>Transport IGST {effectiveTransportGstRate}%</span>
                          <span>₹{transportChargeGstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ) : (
                        <div className={styles.summaryGroup}>
                          <div className={styles.summaryLine}>
                            <span>Transport CGST {effectiveTransportGstRate / 2}%</span>
                            <span>₹{(transportChargeGstAmount / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className={styles.summaryLine}>
                            <span>Transport SGST {effectiveTransportGstRate / 2}%</span>
                            <span>₹{(transportChargeGstAmount / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
                {roundOff !== 0 && (
                  <div className={styles.summaryLine}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? "+" : "−"}₹{Math.abs(roundOff).toFixed(2)}</span>
                  </div>
                )}
                <div className={styles.summaryTotal}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              {(!customerId || items.length === 0 || !placeOfSupply || missingTransportCharge) && (
                <div className={styles.warningList}>
                  {!customerId && <p className={styles.warningItem}>• Select a customer from dropdown</p>}
                  {!placeOfSupply && <p className={styles.warningItem}>• Select place of supply</p>}
                  {items.length === 0 && <p className={styles.warningItem}>• Add at least one item</p>}
                  {missingTransportAmount && <p className={styles.warningItem}>• Enter the transport charge amount</p>}
                  {!missingTransportAmount && missingTransportGstRate && <p className={styles.warningItem}>• Enter a GST rate for the transport charge</p>}
                </div>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  disabled={saving || items.length === 0 || !placeOfSupply || !customerId || missingTransportCharge}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Create Invoice
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="full"
                  onClick={() => {
                    const isDirty = !!customerId || !!customCustomer.name.trim() || items.length > 0 || !!notes.trim();
                    if (isDirty) setShowCancelConfirm(true);
                    else router.push("/sales/invoices");
                  }}
                >
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
