"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import styles from "./new.module.css";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate, validateForm, hasErrors } from "@/lib/validation";
import { INDIA_STATES } from "@/lib/states";

interface Customer { id: string; name: string; city: string; state: string; gstin: string; }
interface Product { id: string; name: string; unit: string; price: number; gstRate: number; stock: number; hsn?: string | null; }
interface LineItem {
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
  hsn: string; discountPercent: number;
}

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 50];
const QUICK_ADD_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen"];

// A custom typed amount rarely lands on a preset % exactly — inject it into
// the option list (rounded to 2dp) so the select actually shows/highlights
// it instead of falling back to blank.
function discountOptionsFor(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  if (DISCOUNT_OPTIONS.includes(rounded)) return DISCOUNT_OPTIONS;
  return [...DISCOUNT_OPTIONS, rounded].sort((a, b) => a - b);
}

export default function NewInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "custom">("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customCustomer, setCustomCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" });
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddProduct, setQuickAddProduct] = useState({ name: "", unit: "Nos", price: "", gstRate: "18" });
  const [quickAddErrors, setQuickAddErrors] = useState<Partial<Record<"name" | "price" | "gstRate", string>>>({});
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [customErrors, setCustomErrors] = useState<Partial<Record<keyof typeof customCustomer, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);

  useEffect(() => {
    fetch("/api/customers", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((all: Customer[]) => {
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
    fetch("/api/products", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(setProducts).catch(() => {});
    fetch("/api/settings", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((s) => setBusinessState(s?.state ?? "")).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount prefill from the initial URL, not meant to re-run on searchParams changes
  }, []);

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  const selectedCustomer = customers.find((c) => c.id === customerId);

  function applyPlaceOfSupply(state: string) {
    setPlaceOfSupply(state);
    if (state && businessState) setIsInterState(state !== businessState);
  }

  const handleCustomerSelect = useCallback((c: Customer) => {
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setPlaceOfSupply(c.state ?? "");
    if (c.state && businessState) setIsInterState(c.state !== businessState);
  }, [businessState]);

  function addProduct(p: Product) {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prev, { productId: p.id, productName: p.name, unit: p.unit, qty: 1, price: p.price, gstRate: p.gstRate, hsn: p.hsn ?? "", discountPercent: 0 }];
    });
    setProductSearch(""); setShowProductDropdown(false);
  }
  function openQuickAddProduct() {
    setQuickAddProduct({ name: productSearch, unit: "Nos", price: "", gstRate: "18" });
    setQuickAddErrors({});
    setShowQuickAddProduct(true);
  }

  async function handleQuickAddProduct() {
    const errs: Partial<Record<"name" | "price" | "gstRate", string>> = {
      name: validate(quickAddProduct.name, rules.required("Product name is required.")) ?? undefined,
      price: validate(quickAddProduct.price, rules.required("Price is required."), rules.nonNegativeNumber()) ?? undefined,
      gstRate: validate(quickAddProduct.gstRate, rules.nonNegativeNumber()) ?? undefined,
    };
    if (Object.values(errs).some(Boolean)) { setQuickAddErrors(errs); return; }
    setQuickAddErrors({});
    setQuickAddSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickAddProduct.name.trim(),
          unit: quickAddProduct.unit.trim() || "Nos",
          price: quickAddProduct.price,
          gstRate: quickAddProduct.gstRate,
          stock: 0,
        }),
      });
      const d = await res.json().catch(() => ({}));
      setQuickAddSaving(false);
      if (!res.ok) { toast({ type: "error", title: "Failed", message: d?.error ?? "Could not add product." }); return; }
      bustCache("/api/products");
      setProducts((prev) => [...prev, d]);
      addProduct(d);
      setShowQuickAddProduct(false);
      setShowProductDropdown(false);
      toast({ type: "success", title: "Product added", message: `"${d.name}" was created and added to this invoice.` });
    } catch {
      setQuickAddSaving(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
  }

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Typing a flat ₹ amount is just another way to set discountPercent — it's
  // converted against that line's gross (qty × rate) so the stored value stays
  // a percentage, same as picking one from the dropdown.
  function setDiscountAmount(idx: number, amountStr: string) {
    const amount = parseFloat(amountStr) || 0;
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = item.qty * item.price;
      const discountPercent = gross > 0 ? Math.min(100, Math.max(0, (amount / gross) * 100)) : 0;
      return { ...item, discountPercent };
    }));
  }

  // Discount is applied to the line's gross amount (qty × rate) before GST —
  // taxable value = gross - discount, and GST is computed on that taxable value.
  const lineBreakdown = (item: LineItem) => {
    const gross = item.qty * item.price;
    const discountAmount = (gross * item.discountPercent) / 100;
    const taxable = gross - discountAmount;
    const gstAmt = (taxable * item.gstRate) / 100;
    return { gross, discountAmount, taxable, gstAmt, total: taxable + gstAmt };
  };

  const grossTotal = items.reduce((sum, item) => sum + lineBreakdown(item).gross, 0);
  const discountTotal = items.reduce((sum, item) => sum + lineBreakdown(item).discountAmount, 0);
  const subtotal = items.reduce((sum, item) => sum + lineBreakdown(item).taxable, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const { gstAmt } = lineBreakdown(item);
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + gstAmt;
    return acc;
  }, {} as Record<number, number>);
  const totalTax = Object.values(taxBreakdown).reduce((a, b) => a + b, 0);
  const grandTotal = subtotal + totalTax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customerMode === "existing" && !customerId) { toast({ type: "error", title: "Check form", message: "Select a customer." }); return; }
    if (customerMode === "custom") {
      const errs = validateForm(customCustomer, {
        name:    [rules.required("Customer name is required.")],
        phone:   [rules.required("Phone number is required."), rules.phone10()],
        email:   [rules.email()],
        pincode: [rules.pincode()],
        gstin:   [rules.gstin()],
      });
      if (hasErrors(errs)) { setCustomErrors(errs); return; }
      setCustomErrors({});
    }
    if (items.length === 0) { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (!placeOfSupply) { toast({ type: "error", title: "Check form", message: "Select place of supply." }); return; }
    if (dueDate && dueDate < todayStr) { toast({ type: "error", title: "Check form", message: "Due date cannot be in the past." }); return; }
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
      items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit, hsn: i.hsn, discountPercent: i.discountPercent })),
      notes, dueDate: dueDate || undefined,
    };
    if (customerMode === "existing") body.customerId = customerId;
    else body.customCustomer = customCustomer;
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      bustCache("/api/invoices");
      bustCache("/api/reports?type=summary");
      bustCache("/api/reports?type=outstanding");
      bustCache("/api/products");
      toast({ type: "success", title: "Invoice created", message: "Invoice saved successfully." });
      if (d.stockWarnings?.length > 0) {
        toast({ type: "warning", title: "Stock went negative", message: d.stockWarnings.join(", ") });
      }
      router.push(`/sales/invoices/${d.id}`);
    }
    else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to create invoice." }); }
  }

  const errInput = (field: keyof typeof customCustomer) =>
    customErrors[field] ? styles.inputError : styles.input;
  const errInputMono = (field: keyof typeof customCustomer) =>
    customErrors[field] ? styles.inputMonoError : styles.inputMono;
  const errMsg = (field: keyof typeof customCustomer) => customErrors[field] ? (
    <p className={styles.errMsg}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4.75v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="10.75" r=".875" fill="currentColor"/></svg>
      {customErrors[field]}
    </p>
  ) : null;
  const clearErr = (field: keyof typeof customCustomer) => {
    if (customErrors[field]) setCustomErrors((p) => ({ ...p, [field]: undefined }));
  };

  return (
    <>
    {saving && <OverlayLoader text="Creating invoice…" />}
    <div className="page-stack">
      <Breadcrumb items={[{ label: "Invoices", href: "/sales/invoices" }, { label: "New Invoice" }]} />
      <div>
        <h1 className="page-title">Create Invoice</h1>
        <p className="page-sub">Generate a GST-compliant invoice</p>
      </div>
      <ConfirmDialog
        open={showCancelConfirm}
        title="Discard this invoice?"
        message="You have unsaved data — customer, items, or notes. If you leave now, everything will be lost."
        confirmLabel="Discard & Leave"
        variant="danger"
        loading={false}
        onConfirm={() => router.push("/sales/invoices")}
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

      <form onSubmit={handleSubmit}>
        <div className={styles.layout}>
          {/* Left column */}
          <div className={styles.leftCol}>
            {/* Customer selector */}
            <div className={`card ${styles.cardPad}`}>
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionTitle}>Bill To</h2>
                {/* Mode toggle */}
                <div className={styles.modeToggle}>
                  {(["existing", "custom"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setCustomerMode(mode); setCustomerId(""); setCustomerSearch(""); setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" }); setPlaceOfSupply(""); }}
                      className={`${styles.modeToggleBtn} ${customerMode === mode ? styles.modeToggleBtnActive : ""}`}
                    >
                      {mode === "existing" ? "Search" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {customerMode === "existing" ? (
                <>
                  <div className={styles.searchWrap}>
                    <input
                      type="text"
                      placeholder="Search customer…"
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                      className={styles.input}
                    />
                    {showCustomerDropdown && (
                      <div className={styles.dropdown} onMouseDown={(e) => e.preventDefault()}>
                        {filteredCustomers.length > 0 ? filteredCustomers.map((c) => (
                          <button key={c.id} type="button" onClick={() => handleCustomerSelect(c)} className={styles.dropdownBtn}>
                            <div className={styles.dropdownItemName}>{c.name}</div>
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
                  </div>
                  {selectedCustomer && (
                    <div className={styles.selectedCustomer}>
                      <div className={styles.selectedCustomerName}>{selectedCustomer.name}</div>
                      <div className={styles.selectedCustomerSub}>
                        {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                        {selectedCustomer.gstin && ` · GSTIN: ${selectedCustomer.gstin}`}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.customForm}>
                  <div>
                    <input
                      type="text" placeholder="Customer name *"
                      value={customCustomer.name}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, name: e.target.value })); clearErr("name"); }}
                      className={errInput("name")}
                    />
                    {errMsg("name")}
                  </div>
                  <div className={styles.grid2}>
                    <div>
                      <input type="tel" placeholder="Phone *" value={customCustomer.phone}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })); clearErr("phone"); }}
                        className={errInput("phone")} />
                      {errMsg("phone")}
                    </div>
                    <div>
                      <input type="email" placeholder="Email" value={customCustomer.email}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, email: e.target.value })); clearErr("email"); }}
                        className={errInput("email")} />
                      {errMsg("email")}
                    </div>
                  </div>
                  <input type="text" placeholder="Address" value={customCustomer.address}
                    onChange={(e) => setCustomCustomer((p) => ({ ...p, address: e.target.value }))} className={styles.input} />
                  <div className={styles.grid3}>
                    <input type="text" placeholder="City" value={customCustomer.city}
                      onChange={(e) => setCustomCustomer((p) => ({ ...p, city: e.target.value }))} className={styles.input} />
                    <input type="text" placeholder="State" value={customCustomer.state}
                      onChange={(e) => {
                        const state = e.target.value;
                        setCustomCustomer((p) => ({ ...p, state }));
                        applyPlaceOfSupply(state);
                      }}
                      className={styles.input} />
                    <div>
                      <input type="text" placeholder="Pincode" value={customCustomer.pincode}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })); clearErr("pincode"); }}
                        className={errInput("pincode")} />
                      {errMsg("pincode")}
                    </div>
                  </div>
                  <div>
                    <input type="text" placeholder="GSTIN" value={customCustomer.gstin} maxLength={15}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, gstin: e.target.value })); clearErr("gstin"); }}
                      className={errInputMono("gstin")} />
                    {errMsg("gstin")}
                  </div>
                  <p className={styles.customFormHint}>
                    This customer will be saved automatically for future use.
                  </p>
                </div>
              )}
            </div>

            {/* Place of supply + inter-state toggle + due date */}
            <div className={`card ${styles.cardPad}`}>
              <div className={styles.toggleRow}>
                <div className={styles.dueDateRow}>
                  <label className={styles.dueDateLabel}>Place of supply *</label>
                  <select
                    value={placeOfSupply}
                    onChange={(e) => applyPlaceOfSupply(e.target.value)}
                    className={styles.dueDateInput}
                  >
                    <option value="">Select state…</option>
                    {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label className={styles.switchLabel}>
                  <div
                    role="switch"
                    aria-checked={isInterState}
                    onClick={() => setIsInterState((v) => !v)}
                    className={`${styles.switchTrack} ${isInterState ? styles.switchTrackOn : ""}`}
                  >
                    <span className={`${styles.switchThumb} ${isInterState ? styles.switchThumbOn : ""}`} />
                  </div>
                  <span className={styles.switchText}>Inter-state supply (IGST)</span>
                </label>
                <label className={styles.switchLabel}>
                  <div
                    role="switch"
                    aria-checked={reverseCharge}
                    onClick={() => setReverseCharge((v) => !v)}
                    className={`${styles.switchTrack} ${reverseCharge ? styles.switchTrackOn : ""}`}
                  >
                    <span className={`${styles.switchThumb} ${reverseCharge ? styles.switchThumbOn : ""}`} />
                  </div>
                  <span className={styles.switchText}>Reverse charge applicable</span>
                </label>
                <div className={styles.dueDateRow}>
                  <label className={styles.dueDateLabel}>Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    min={todayStr}
                    onChange={(e) => setDueDate(e.target.value)}
                    onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
                    className={styles.dueDateInput}
                  />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className={`card ${styles.cardPad}`}>
              <h2 className={styles.lineItemsHeading}>Line Items</h2>
              <div className={styles.productSearchWrap}>
                <input
                  type="text"
                  placeholder="Search and add product…"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                  className={styles.input}
                />
                {showProductDropdown && (
                  <div className={styles.dropdown} onMouseDown={(e) => e.preventDefault()}>
                    {filteredProducts.length > 0 ? filteredProducts.map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)} className={styles.dropdownBtn}>
                        <div className={styles.dropdownItemName}>{p.name}</div>
                        <div className={styles.dropdownItemMeta}>
                          {p.unit} · ₹{p.price} · GST {p.gstRate}% · Stock: {p.stock}
                        </div>
                      </button>
                    )) : (
                      <div className={styles.dropdownEmpty}>
                        No product found.{" "}
                        <button type="button" className={styles.dropdownEmptyLink} onMouseDown={(e) => e.preventDefault()} onClick={openQuickAddProduct}>
                          Add new product →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showQuickAddProduct && (
                <div className={styles.customForm}>
                  <div>
                    <input
                      type="text" placeholder="Product name *"
                      value={quickAddProduct.name}
                      onChange={(e) => { setQuickAddProduct((p) => ({ ...p, name: e.target.value })); setQuickAddErrors((p) => ({ ...p, name: undefined })); }}
                      className={quickAddErrors.name ? styles.inputError : styles.input}
                    />
                    {quickAddErrors.name && <p className={styles.errMsg}>{quickAddErrors.name}</p>}
                  </div>
                  <div className={styles.grid3}>
                    <select
                      value={quickAddProduct.unit}
                      onChange={(e) => setQuickAddProduct((p) => ({ ...p, unit: e.target.value }))}
                      className={styles.input}
                    >
                      {QUICK_ADD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <div>
                      <input
                        type="text" inputMode="decimal" placeholder="Price (₹) *"
                        value={quickAddProduct.price}
                        onChange={(e) => { setQuickAddProduct((p) => ({ ...p, price: e.target.value })); setQuickAddErrors((p) => ({ ...p, price: undefined })); }}
                        className={quickAddErrors.price ? styles.inputError : styles.input}
                      />
                      {quickAddErrors.price && <p className={styles.errMsg}>{quickAddErrors.price}</p>}
                    </div>
                    <div>
                      <input
                        type="text" inputMode="decimal" placeholder="GST %"
                        value={quickAddProduct.gstRate}
                        onChange={(e) => { setQuickAddProduct((p) => ({ ...p, gstRate: e.target.value })); setQuickAddErrors((p) => ({ ...p, gstRate: undefined })); }}
                        className={quickAddErrors.gstRate ? styles.inputError : styles.input}
                      />
                      {quickAddErrors.gstRate && <p className={styles.errMsg}>{quickAddErrors.gstRate}</p>}
                    </div>
                  </div>
                  <div className={styles.grid2}>
                    <Button type="button" variant="primary" size="sm" onClick={handleQuickAddProduct} disabled={quickAddSaving}>
                      {quickAddSaving ? "Adding…" : "Add & use product"}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowQuickAddProduct(false)} disabled={quickAddSaving}>
                      Cancel
                    </Button>
                  </div>
                  <p className={styles.customFormHint}>
                    This product will be saved to your catalog and added to this invoice.
                  </p>
                </div>
              )}

              {items.length > 0 ? (
                <div className={styles.itemsTableWrap}>
                  <table className={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th className={styles.th}>#</th>
                        <th className={styles.th}>Product</th>
                        <th className={styles.thCenter}>HSN/SAC</th>
                        <th className={styles.thCenter}>Unit</th>
                        <th className={styles.thCenter}>Qty</th>
                        <th className={styles.thRight}>List Price (₹)</th>
                        <th className={styles.thCenter}>Discount</th>
                        <th className={styles.thCenter}>GST %</th>
                        <th className={styles.thRight}>GST Amt</th>
                        <th className={styles.thRight}>Total (₹)</th>
                        <th className={styles.thAction} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const { discountAmount, gstAmt: lineGst, total: lineTotal } = lineBreakdown(item);
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? styles.itemRow : styles.itemRowAlt}>
                            <td className={styles.tdIndex}>{idx + 1}</td>
                            <td className={styles.tdProduct}>
                              <div className={styles.tdProductInner} title={item.productName}>{item.productName}</div>
                            </td>
                            <td className={styles.tdCenter}>
                              <input
                                type="text" value={item.hsn}
                                onChange={(e) => updateItem(idx, "hsn", e.target.value)}
                                placeholder="HSN/SAC"
                                className={styles.hsnInput}
                              />
                            </td>
                            <td className={styles.tdCenter}>
                              <span className={styles.unitBadge}>
                                {item.unit}
                              </span>
                            </td>
                            <td className={styles.tdCenter}>
                              <input
                                type="number" min="1" value={item.qty}
                                onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 1)}
                                className={styles.qtyInput}
                              />
                            </td>
                            <td className={styles.tdRight}>
                              <input
                                type="text" inputMode="decimal" value={item.price}
                                onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                className={styles.priceInput}
                              />
                            </td>
                            <td className={styles.discountCell}>
                              <div className={styles.discountStack}>
                                <select
                                  value={Math.round(item.discountPercent * 100) / 100}
                                  onChange={(e) => updateItem(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                                  className={styles.discountSelect}
                                >
                                  {discountOptionsFor(item.discountPercent).map((d) => <option key={d} value={d}>{d}%</option>)}
                                </select>
                                <input
                                  type="text" inputMode="decimal"
                                  value={discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""}
                                  onChange={(e) => setDiscountAmount(idx, e.target.value)}
                                  placeholder="₹0"
                                  title="Flat discount amount"
                                  className={styles.discountAmountInput}
                                />
                              </div>
                            </td>
                            <td className={styles.tdCenter}>
                              <span className={styles.gstBadge}>
                                {item.gstRate}%
                              </span>
                            </td>
                            <td className={styles.tdGstAmt}>
                              ₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={styles.tdTotal}>
                              ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={styles.tdActionCell}>
                              <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeBtn}>
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyItems}>
                  Search for a product above to add items
                </div>
              )}
            </div>

            {/* Notes */}
            <div className={`card ${styles.cardPad}`}>
              <label className={styles.notesLabel}>Notes / Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, delivery instructions, or any other notes…"
                className={styles.notesTextarea}
              />
            </div>
          </div>

          {/* Right — summary */}
          <div className={styles.rightCol}>
            <div className={`card ${styles.summaryCard}`}>
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
                <div className={styles.summaryTotal}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              {((customerMode === "existing" ? !customerId : (!customCustomer.name.trim() || !customCustomer.phone.trim())) || items.length === 0 || !placeOfSupply) && (
                <div className={styles.warningList}>
                  {customerMode === "existing" && !customerId && <p className={styles.warningItem}>• Select a customer from dropdown</p>}
                  {customerMode === "custom" && !customCustomer.name.trim() && <p className={styles.warningItem}>• Enter customer name</p>}
                  {customerMode === "custom" && customCustomer.name.trim() && !customCustomer.phone.trim() && <p className={styles.warningItem}>• Enter customer phone number</p>}
                  {!placeOfSupply && <p className={styles.warningItem}>• Select place of supply</p>}
                  {items.length === 0 && <p className={styles.warningItem}>• Add at least one item</p>}
                </div>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  disabled={saving || items.length === 0 || !placeOfSupply || (customerMode === "existing" ? !customerId : (!customCustomer.name.trim() || !customCustomer.phone.trim()))}
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
