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
  const [sellerState, setSellerState] = useState("");
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
  const [error, setError] = useState("");
  const [customErrors, setCustomErrors] = useState<Partial<Record<keyof typeof customCustomer, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => { setSellerState(s.state ?? ""); }).catch(() => {});
    fetch("/api/customers").then((r) => r.json()).then((all: Customer[]) => {
      setCustomers(all);
      const prefillId = searchParams.get("customerId");
      if (prefillId) {
        const found = all.find((c) => c.id === prefillId);
        if (found) {
          setCustomerId(found.id);
          setCustomerSearch(found.name);
          setIsInterState(found.state && found.state !== sellerState ? true : false);
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
    setIsInterState(c.state && c.state !== sellerState ? true : false);
  }, [sellerState]);

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
    if (customerMode === "existing" && !customerId) { setError("Select a customer."); return; }
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
    if (items.length === 0) { setError("Add at least one item."); return; }
    setError("");

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
    else { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed to create invoice."); }
  }

  const dropdownStyle: React.CSSProperties = {
    position: "absolute", zIndex: 20, marginTop: "0.25rem", width: "100%",
    background: "var(--c-bg-card)", border: "1px solid var(--c-border)",
    borderRadius: "0.5rem", boxShadow: "var(--c-shadow-lg)", maxHeight: "13rem", overflowY: "auto",
  };
  const dropdownBtnStyle: React.CSSProperties = {
    width: "100%", textAlign: "left", padding: "0.625rem 1rem", background: "none",
    border: "none", borderBottom: "1px solid var(--c-border)", cursor: "pointer",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.625rem 0.875rem", borderRadius: "0.5rem",
    border: "1px solid var(--c-border)", background: "var(--c-bg-input)",
    color: "var(--c-text)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
  };
  const errInput = (field: keyof typeof customCustomer): React.CSSProperties =>
    customErrors[field] ? { ...inputStyle, borderColor: "var(--c-red)", boxShadow: "0 0 0 3px var(--c-red-bg)" } : inputStyle;
  const errMsg = (field: keyof typeof customCustomer) => customErrors[field] ? (
    <p style={{ marginTop: "0.25rem", fontSize: "0.72rem", color: "var(--c-red)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
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
      {error && <div className="error-banner">{error}</div>}

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
          <div style={{ border: "1px solid var(--c-red-border)", borderRadius: "0.5rem", overflow: "hidden" }}>
            <div style={{ background: "var(--c-red-bg)", padding: "0.5rem 0.875rem", display: "flex", alignItems: "center", gap: "0.375rem", borderBottom: "1px solid var(--c-red-border)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--c-red)" }}>Insufficient stock</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {stockOutItems.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "0.5rem 0.875rem", borderBottom: i < stockOutItems.length - 1 ? "1px solid var(--c-red-border)" : "none", background: i % 2 === 0 ? "var(--c-red-bg)" : "transparent" }}>
                  <span style={{ fontWeight: 600, color: "var(--c-red)", fontSize: "0.8125rem" }}>{item.name}</span>
                  <span style={{ color: "var(--c-red)", whiteSpace: "nowrap", fontSize: "0.75rem", opacity: 0.85 }}>
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
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)" }}>Bill To</h2>
                {/* Mode toggle */}
                <div style={{ display: "flex", background: "var(--c-bg-sub)", borderRadius: "0.5rem", padding: "0.2rem", gap: "0.2rem" }}>
                  {(["existing", "custom"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setCustomerMode(mode); setCustomerId(""); setCustomerSearch(""); setCustomCustomer({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "" }); }}
                      style={{
                        padding: "0.25rem 0.75rem", borderRadius: "0.375rem", border: "none", cursor: "pointer",
                        fontSize: "0.75rem", fontWeight: 600, transition: "all 0.15s",
                        background: customerMode === mode ? "var(--c-bg-card)" : "transparent",
                        color: customerMode === mode ? "var(--c-text)" : "var(--c-text-4)",
                        boxShadow: customerMode === mode ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      {mode === "existing" ? "Search" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {customerMode === "existing" ? (
                <>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Search customer…"
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                      style={inputStyle}
                    />
                    {showCustomerDropdown && (
                      <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                        {filteredCustomers.length > 0 ? filteredCustomers.map((c) => (
                          <button key={c.id} type="button" onClick={() => handleCustomerSelect(c)} style={dropdownBtnStyle}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-sub)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                            <div style={{ fontWeight: 500, color: "var(--c-text)" }}>{c.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>{c.city}{c.gstin ? ` · ${c.gstin}` : ""}</div>
                          </button>
                        )) : (
                          <div style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "var(--c-text-3)" }}>
                            No customer found.{" "}
                            <Link href="/sales/customers/new" style={{ color: "var(--c-blue)", fontWeight: 500 }}>Add new →</Link>
                          </div>
                        )}
                      </div>
                    )}
                    {customerSearch && !customerId && (
                      <p style={{ marginTop: "0.375rem", fontSize: "0.75rem", color: "var(--c-amber-text)" }}>
                        ⚠ Please select a customer from the dropdown
                      </p>
                    )}
                  </div>
                  {selectedCustomer && (
                    <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "var(--c-blue-bg)", borderRadius: "0.625rem", border: "1px solid var(--c-blue-border)" }}>
                      <div style={{ fontWeight: 500, color: "var(--c-blue-text)" }}>{selectedCustomer.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--c-blue)", marginTop: "0.125rem" }}>
                        {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                        {selectedCustomer.gstin && ` · GSTIN: ${selectedCustomer.gstin}`}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  <div>
                    <input
                      type="text" placeholder="Customer name *"
                      value={customCustomer.name}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, name: e.target.value })); clearErr("name"); }}
                      style={errInput("name")}
                    />
                    {errMsg("name")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                    <div>
                      <input type="tel" placeholder="Phone *" value={customCustomer.phone}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })); clearErr("phone"); }}
                        style={errInput("phone")} />
                      {errMsg("phone")}
                    </div>
                    <div>
                      <input type="email" placeholder="Email" value={customCustomer.email}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, email: e.target.value })); clearErr("email"); }}
                        style={errInput("email")} />
                      {errMsg("email")}
                    </div>
                  </div>
                  <input type="text" placeholder="Address" value={customCustomer.address}
                    onChange={(e) => setCustomCustomer((p) => ({ ...p, address: e.target.value }))} style={inputStyle} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.625rem" }}>
                    <input type="text" placeholder="City" value={customCustomer.city}
                      onChange={(e) => setCustomCustomer((p) => ({ ...p, city: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="State" value={customCustomer.state}
                      onChange={(e) => {
                        const state = e.target.value;
                        setCustomCustomer((p) => ({ ...p, state }));
                        setIsInterState(!!state && state !== sellerState);
                      }} style={inputStyle} />
                    <div>
                      <input type="text" placeholder="Pincode" value={customCustomer.pincode}
                        onChange={(e) => { setCustomCustomer((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })); clearErr("pincode"); }}
                        style={errInput("pincode")} />
                      {errMsg("pincode")}
                    </div>
                  </div>
                  <div>
                    <input type="text" placeholder="GSTIN" value={customCustomer.gstin}
                      onChange={(e) => { setCustomCustomer((p) => ({ ...p, gstin: e.target.value })); clearErr("gstin"); }}
                      style={{ ...errInput("gstin"), fontFamily: "var(--font-mono)", textTransform: "uppercase" }} />
                    {errMsg("gstin")}
                  </div>
                  <p style={{ fontSize: "0.7rem", color: "var(--c-text-4)" }}>
                    This customer will be saved automatically for future use.
                  </p>
                </div>
              )}
            </div>

            {/* Inter-state toggle + due date */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer" }}>
                  <div
                    role="switch"
                    aria-checked={isInterState}
                    onClick={() => setIsInterState((v) => !v)}
                    style={{
                      position: "relative", width: "2.5rem", height: "1.25rem", borderRadius: "9999px", cursor: "pointer",
                      background: isInterState ? "var(--c-blue)" : "var(--c-border-md)", transition: "background 0.2s",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: "0.125rem",
                      left: isInterState ? "1.375rem" : "0.125rem",
                      width: "1rem", height: "1rem", borderRadius: "9999px", background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
                    }} />
                  </div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--c-text-2)" }}>Inter-state supply (IGST)</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--c-text-2)" }}>Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={{ padding: "0.375rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--c-border)", background: "var(--c-bg-input)", color: "var(--c-text)", fontSize: "0.875rem", outline: "none" }}
                  />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "0.75rem" }}>Line Items</h2>
              <div style={{ position: "relative", marginBottom: "1rem" }}>
                <input
                  type="text"
                  placeholder="Search and add product…"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                  style={inputStyle}
                />
                {showProductDropdown && (
                  <div style={dropdownStyle} onMouseDown={(e) => e.preventDefault()}>
                    {filteredProducts.length > 0 ? filteredProducts.map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)} style={dropdownBtnStyle}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                        <div style={{ fontWeight: 500, color: "var(--c-text)" }}>{p.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>
                          {p.unit} · ₹{p.price} · GST {p.gstRate}% · Stock: {p.stock}
                        </div>
                      </button>
                    )) : (
                      <div style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "var(--c-text-3)" }}>
                        No product found.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {items.length > 0 ? (
                <div style={{ overflowX: "auto", borderRadius: "0.625rem", border: "1px solid var(--c-border)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ background: "var(--c-bg-sub)" }}>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "left",  fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>#</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "left",  fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>Product</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "center",fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>Unit</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "center",fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>Qty</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>Rate (₹)</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "center",fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>GST %</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>GST Amt</th>
                        <th style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--c-border)" }}>Total (₹)</th>
                        <th style={{ padding: "0.625rem 0.5rem",  borderBottom: "1px solid var(--c-border)", width: "2rem" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineBase = item.qty * item.price;
                        const lineGst  = lineBase * item.gstRate / 100;
                        const lineTotal = lineBase + lineGst;
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--c-border)", background: idx % 2 === 0 ? "transparent" : "var(--c-bg-sub)" }}>
                            <td style={{ padding: "0.625rem 0.875rem", color: "var(--c-text-4)", fontSize: "0.75rem", fontWeight: 500 }}>{idx + 1}</td>
                            <td style={{ padding: "0.625rem 0.875rem", fontWeight: 600, color: "var(--c-text)", maxWidth: "12rem" }}>
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.productName}</div>
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}>
                              <span style={{ display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "0.375rem", background: "var(--c-bg-2, var(--c-bg-sub))", border: "1px solid var(--c-border)", fontSize: "0.75rem", color: "var(--c-text-3)", fontWeight: 500 }}>
                                {item.unit}
                              </span>
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}>
                              <input
                                type="number" min="1" value={item.qty}
                                onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 1)}
                                style={{ width: "4.5rem", padding: "0.375rem 0.5rem", borderRadius: "0.375rem", border: "1px solid var(--c-blue-border, #bfdbfe)", background: "var(--c-bg-input)", color: "var(--c-text)", fontSize: "0.8125rem", fontWeight: 600, textAlign: "center", outline: "none" }}
                              />
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "right" }}>
                              <input
                                type="number" min="0" step="0.01" value={item.price}
                                onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                style={{ width: "6rem", padding: "0.375rem 0.5rem", borderRadius: "0.375rem", border: "1px solid var(--c-blue-border, #bfdbfe)", background: "var(--c-bg-input)", color: "var(--c-text)", fontSize: "0.8125rem", fontWeight: 600, textAlign: "right", outline: "none" }}
                              />
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}>
                              <span style={{ display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "0.375rem", background: "var(--c-green-bg)", border: "1px solid var(--c-green-border)", fontSize: "0.75rem", color: "var(--c-green-text)", fontWeight: 600 }}>
                                {item.gstRate}%
                              </span>
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--c-text-3)" }}>
                              ₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontWeight: 700, fontSize: "0.875rem", color: "var(--c-text)" }}>
                              ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "0.625rem 0.5rem", textAlign: "center" }}>
                              <button type="button" onClick={() => removeItem(idx)} aria-label="Remove"
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "none", border: "1px solid var(--c-border)", cursor: "pointer", color: "var(--c-text-4)", fontSize: "0.875rem", lineHeight: 1, transition: "all 0.15s" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-red-bg)"; e.currentTarget.style.borderColor = "var(--c-red-border)"; e.currentTarget.style.color = "var(--c-red-text)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "var(--c-border)"; e.currentTarget.style.color = "var(--c-text-4)"; }}>
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
                <div style={{ textAlign: "center", padding: "2rem", fontSize: "0.875rem", color: "var(--c-text-4)", border: "2px dashed var(--c-border)", borderRadius: "0.625rem" }}>
                  Search for a product above to add items
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--c-text-2)", marginBottom: "0.375rem" }}>Notes / Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, delivery instructions, or any other notes…"
                style={{ ...inputStyle, resize: "none" }}
              />
            </div>
          </div>

          {/* Right — summary */}
          <div className={styles.rightCol}>
            <div className="card" style={{ padding: "1.25rem", position: "sticky", top: "1rem" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "1rem" }}>Invoice Summary</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.875rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--c-text-3)" }}>
                  <span>Subtotal</span>
                  <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                {Object.entries(taxBreakdown).map(([rate, amt]) =>
                  isInterState ? (
                    <div key={rate} style={{ display: "flex", justifyContent: "space-between", color: "var(--c-text-3)" }}>
                      <span>IGST {rate}%</span>
                      <span>₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div key={rate} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--c-text-3)" }}>
                        <span>CGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--c-text-3)" }}>
                        <span>SGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                )}
                <div style={{ borderTop: "1px solid var(--c-border)", paddingTop: "0.625rem", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1rem", color: "var(--c-text)" }}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              {((customerMode === "existing" ? !customerId : (!customCustomer.name.trim() || !customCustomer.phone.trim())) || items.length === 0) && (
                <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem" }}>
                  {customerMode === "existing" && !customerId && <p style={{ color: "var(--c-amber-text)" }}>• Select a customer from dropdown</p>}
                  {customerMode === "custom" && !customCustomer.name.trim() && <p style={{ color: "var(--c-amber-text)" }}>• Enter customer name</p>}
                  {customerMode === "custom" && customCustomer.name.trim() && !customCustomer.phone.trim() && <p style={{ color: "var(--c-amber-text)" }}>• Enter customer phone number</p>}
                  {items.length === 0 && <p style={{ color: "var(--c-amber-text)" }}>• Add at least one item</p>}
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
