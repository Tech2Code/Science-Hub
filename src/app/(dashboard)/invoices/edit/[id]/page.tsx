"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Sk } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import styles from "./edit.module.css";

const SELLER_STATE = "Rajasthan";

interface Product {
  id: string; name: string; unit: string; price: number; gstRate: number; stock: number;
}

interface LineItem {
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
}

interface InvoiceData {
  id: string; invoiceNumber: string; status: string;
  isInterState: boolean; dueDate?: string; notes?: string;
  customer: { id: string; name: string; city: string; state: string; gstin: string; };
  items: Array<{ productId: string; name: string; unit: string; quantity: number; price: number; gstRate: number; }>;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isInterState, setIsInterState] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCached(`/api/invoices/${id}`),
      fetchCached("/api/products").catch(() => []),
    ]).then(([inv, prods]) => {
      const invoice = inv as InvoiceData;
      const products = prods as Product[];
      if (invoice?.status === "paid") {
        setError("Paid invoices cannot be edited.");
        setLoading(false);
        return;
      }
      setInvoice(invoice);
      setProducts(products);
      setIsInterState(invoice.isInterState ?? false);
      setNotes(invoice.notes ?? "");
      setDueDate(invoice.dueDate ? invoice.dueDate.split("T")[0] : "");
      setItems(invoice.items.map((item: InvoiceData["items"][0]) => ({
        productId: item.productId,
        productName: item.name,
        unit: item.unit,
        qty: item.quantity,
        price: item.price,
        gstRate: item.gstRate,
      })));
      setLoading(false);
    }).catch(() => { setError("Failed to load invoice."); setLoading(false); });
  }, [id]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addProduct = useCallback((p: Product) => {
    setItems((prev) => [...prev, { productId: p.id, productName: p.name, unit: p.unit, qty: 1, price: p.price, gstRate: p.gstRate }]);
    setProductSearch("");
    setShowProductDropdown(false);
  }, []);

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const taxable = item.qty * item.price;
    const taxAmt = (taxable * item.gstRate) / 100;
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + taxAmt;
    return acc;
  }, {} as Record<number, number>);
  const totalTax = Object.values(taxBreakdown).reduce((a, b) => a + b, 0);
  const grandTotal = subtotal + totalTax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) { setError("Add at least one item."); return; }
    setError(""); setSaving(true);
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isInterState,
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit })),
        notes,
        dueDate: dueDate || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) { bustCache(`/api/invoices/${id}`); toast({ type: "success", title: "Invoice updated", message: "Changes saved." }); router.push(`/invoices/${id}`); }
    else { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed to update invoice."); }
  }

  if (loading) return (
    <div className="page-stack">
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <Sk w={220} h={14} />
      <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Sk w={160} h={13} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 40px", gap: "0.75rem", alignItems: "center" }}>
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk w={28} h={28} r={6} />
          </div>
        ))}
        <Sk w={120} h={32} r={8} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1rem" }}>
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Sk w={100} h={13} />
          <Sk h={80} r={8} />
        </div>
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <Sk w="40%" h={13} />
              <Sk w="30%" h={13} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (error && !invoice) return <div className="loading-center" style={{ color: "var(--c-red)" }}>{error}</div>;
  if (!invoice) return null;

  return (
    <div className="page-stack">
      <Breadcrumb items={[
        { label: "Invoices", href: "/invoices" },
        { label: invoice.invoiceNumber, href: `/invoices/${id}` },
        { label: "Edit" },
      ]} />
      <div>
        <h1 className="page-title">Edit Invoice — {invoice.invoiceNumber}</h1>
        <p className="page-sub">Editing is allowed only while the invoice is unpaid or partially paid.</p>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.layout}>
          {/* Left column */}
          <div className={styles.leftCol}>
            {/* Customer (read-only) */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "0.75rem" }}>Bill To</h2>
              <div style={{ padding: "0.75rem 1rem", borderRadius: "0.625rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)" }}>
                <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{invoice.customer.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: "0.25rem" }}>
                  {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                  {invoice.customer.gstin && ` · GSTIN: ${invoice.customer.gstin}`}
                </div>
              </div>
            </div>

            {/* Inter-state + due date */}
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
                    style={{
                      padding: "0.375rem 0.75rem", borderRadius: "0.5rem",
                      border: "1px solid var(--c-border)", background: "var(--c-bg-input)",
                      color: "var(--c-text)", fontSize: "0.875rem", outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: "0.75rem" }}>Line Items</h2>
              <div style={{ position: "relative", marginBottom: "1rem" }}>
                <input
                  type="text"
                  placeholder="Search and add product…"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  style={{
                    width: "100%", padding: "0.625rem 0.875rem", borderRadius: "0.5rem",
                    border: "1px solid var(--c-border)", background: "var(--c-bg-input)",
                    color: "var(--c-text)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
                  }}
                />
                {showProductDropdown && productSearch && filteredProducts.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 20, marginTop: "0.25rem", width: "100%",
                    background: "var(--c-bg-card)", border: "1px solid var(--c-border)",
                    borderRadius: "0.5rem", boxShadow: "var(--c-shadow-lg)", maxHeight: "13rem", overflowY: "auto",
                  }}>
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id} type="button" onClick={() => addProduct(p)}
                        style={{
                          width: "100%", textAlign: "left", padding: "0.625rem 1rem", background: "none",
                          border: "none", borderBottom: "1px solid var(--c-border)", cursor: "pointer",
                          fontSize: "0.875rem",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-sub)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ fontWeight: 500, color: "var(--c-text)" }}>{p.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>{p.unit} · ₹{p.price} · GST {p.gstRate}% · Stock: {p.stock}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                        {["Product", "Unit", "Qty", "Rate", "GST%", "Amount", ""].map((h, i) => (
                          <th key={i} style={{ padding: "0.375rem 0.5rem", textAlign: i >= 2 && i < 6 ? "right" : "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--c-border)" }}>
                          <td style={{ padding: "0.5rem", fontWeight: 500, color: "var(--c-text)" }}>{item.productName}</td>
                          <td style={{ padding: "0.5rem", color: "var(--c-text-3)", fontSize: "0.75rem" }}>{item.unit}</td>
                          <td style={{ padding: "0.5rem" }}>
                            <input type="number" min="1" value={item.qty}
                              onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 1)}
                              style={{ width: "4rem", padding: "0.25rem 0.375rem", borderRadius: "0.375rem", border: "1px solid var(--c-border)", background: "var(--c-bg-input)", color: "var(--c-text)", fontSize: "0.75rem", textAlign: "right" }}
                            />
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input type="number" min="0" step="0.01" value={item.price}
                              onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                              style={{ width: "5.5rem", padding: "0.25rem 0.375rem", borderRadius: "0.375rem", border: "1px solid var(--c-border)", background: "var(--c-bg-input)", color: "var(--c-text)", fontSize: "0.75rem", textAlign: "right" }}
                            />
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontSize: "0.75rem", color: "var(--c-text-3)" }}>{item.gstRate}%</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 500, fontSize: "0.75rem", color: "var(--c-text)" }}>₹{(item.qty * item.price).toLocaleString("en-IN")}</td>
                          <td style={{ padding: "0.5rem" }}>
                            <button type="button" onClick={() => removeItem(idx)} aria-label="Remove"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-4)", fontSize: "1rem", lineHeight: 1, padding: "0.125rem 0.375rem" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-red)")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-4)")}
                            >×</button>
                          </td>
                        </tr>
                      ))}
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
                placeholder="Payment terms, delivery instructions…"
                style={{
                  width: "100%", padding: "0.625rem 0.875rem", borderRadius: "0.5rem",
                  border: "1px solid var(--c-border)", background: "var(--c-bg-input)",
                  color: "var(--c-text)", fontSize: "0.875rem", resize: "none", outline: "none", boxSizing: "border-box",
                }}
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
              {items.length === 0 && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--c-amber-text)" }}>• Add at least one item</p>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  loading={saving}
                  fullScreen
                  disabled={saving || items.length === 0}
                >
                  {saving ? "Saving…" : "Update Invoice"}
                </Button>
                <Button variant="secondary" href={`/invoices/${id}`} size="full">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
