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
import { rules, validateForm, hasErrors } from "@/lib/validation";

interface Customer { id: string; name: string; city: string; state: string; gstin: string; }
interface Product { id: string; name: string; unit: string; price: number; gstRate: number; stock: number; }
interface LineItem {
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
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
  const [items, setItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [customErrors, setCustomErrors] = useState<Partial<Record<keyof typeof customCustomer, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((all: Customer[]) => {
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
    fetch("/api/products").then((r) => r.json()).then(setProducts).catch(() => {});
  }, []);

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleCustomerSelect = useCallback((c: Customer) => {
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
  }, []);

  function addProduct(p: Product) {
    setItems((prev) => [...prev, { productId: p.id, productName: p.name, unit: p.unit, qty: 1, price: p.price, gstRate: p.gstRate }]);
    setProductSearch(""); setShowProductDropdown(false);
  }
  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const taxAmt = (item.qty * item.price * item.gstRate) / 100;
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + taxAmt;
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
      items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit })),
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
                      onClick={() => { setCustomerMode(mode); setCustomerId(""); setCustomerSearch(""); setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" }); }}
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
                      onChange={(e) => setCustomCustomer((p) => ({ ...p, state: e.target.value }))}
                      className={styles.input} />
                    <div>
                      <input type="text" placeholder="Pincode" value={customCustomer.pincode}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })); clearErr("pincode"); }}
                        className={errInput("pincode")} />
                      {errMsg("pincode")}
                    </div>
                  </div>
                  <div>
                    <input type="text" placeholder="GSTIN" value={customCustomer.gstin}
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

            {/* Inter-state toggle + due date */}
            <div className={`card ${styles.cardPad}`}>
              <div className={styles.toggleRow}>
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
                <div className={styles.dueDateRow}>
                  <label className={styles.dueDateLabel}>Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
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
                        No product found.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {items.length > 0 ? (
                <div className={styles.itemsTableWrap}>
                  <table className={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th className={styles.th}>#</th>
                        <th className={styles.th}>Product</th>
                        <th className={styles.thCenter}>Unit</th>
                        <th className={styles.thCenter}>Qty</th>
                        <th className={styles.thRight}>Rate (₹)</th>
                        <th className={styles.thCenter}>GST %</th>
                        <th className={styles.thRight}>GST Amt</th>
                        <th className={styles.thRight}>Total (₹)</th>
                        <th className={styles.thAction} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineBase = item.qty * item.price;
                        const lineGst  = lineBase * item.gstRate / 100;
                        const lineTotal = lineBase + lineGst;
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? styles.itemRow : styles.itemRowAlt}>
                            <td className={styles.tdIndex}>{idx + 1}</td>
                            <td className={styles.tdProduct}>
                              <div className={styles.tdProductInner}>{item.productName}</div>
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
                                type="number" min="0" step="0.01" value={item.price}
                                onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                className={styles.priceInput}
                              />
                            </td>
                            <td className={styles.tdCenter}>
                              <span className={styles.gstBadge}>
                                {item.gstRate}%
                              </span>
                            </td>
                            <td className={styles.tdGstAmt}>
                              ₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className={styles.tdTotal}>
                              ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
                  <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                {Object.entries(taxBreakdown).map(([rate, amt]) =>
                  isInterState ? (
                    <div key={rate} className={styles.summaryLine}>
                      <span>IGST {rate}%</span>
                      <span>₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div key={rate} className={styles.summaryGroup}>
                      <div className={styles.summaryLine}>
                        <span>CGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className={styles.summaryLine}>
                        <span>SGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                )}
                <div className={styles.summaryTotal}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              {((customerMode === "existing" ? !customerId : (!customCustomer.name.trim() || !customCustomer.phone.trim())) || items.length === 0) && (
                <div className={styles.warningList}>
                  {customerMode === "existing" && !customerId && <p className={styles.warningItem}>• Select a customer from dropdown</p>}
                  {customerMode === "custom" && !customCustomer.name.trim() && <p className={styles.warningItem}>• Enter customer name</p>}
                  {customerMode === "custom" && customCustomer.name.trim() && !customCustomer.phone.trim() && <p className={styles.warningItem}>• Enter customer phone number</p>}
                  {items.length === 0 && <p className={styles.warningItem}>• Add at least one item</p>}
                </div>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  disabled={saving || items.length === 0 || (customerMode === "existing" ? !customerId : (!customCustomer.name.trim() || !customCustomer.phone.trim()))}
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
