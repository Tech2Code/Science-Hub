"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { fetchCached } from "@/lib/useCache";

interface Bill {
  id: string; billNumber: string; billDate: string;
  total: number; paidAmount: number; status: string;
}
interface Vendor {
  id: string; name: string; company: string | null; gstin: string | null;
  phone: string | null; email: string | null; address: string | null;
  notes: string | null; isActive: boolean; purchaseBills: Bill[];
}

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "var(--c-border)",
      animation: "skPulse 1.4s ease-in-out infinite",
    }} />
  );
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCached(`/api/vendors/${id}`)
      .then((d) => { setVendor(d as Vendor); setLoading(false); })
      .catch(() => { setError("Vendor not found."); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="page-stack" style={{ maxWidth: "56rem" }}>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <Sk w={160} h={13} />
      <div className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Sk w={48} h={48} r={9999} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Sk w={160} h={20} /><Sk w={220} h={13} /><Sk w={120} h={20} r={6} />
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[1,2,3].map(i => (
          <div key={i} className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <Sk w={80} h={11} /><Sk w={120} h={22} />
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}><Sk w={120} h={14} /></div>
        <div className="table-wrap">
          <table className="table-base"><tbody><TableSkeleton cols={6} rows={4} /></tbody></table>
        </div>
      </div>
    </div>
  );

  if (error || !vendor)
    return <div className="loading-center" style={{ color: "var(--c-red)" }}>{error || "Vendor not found."}</div>;

  const totalBilled = vendor.purchaseBills.reduce((s, b) => s + b.total, 0);
  const totalPaid   = vendor.purchaseBills.reduce((s, b) => s + b.paidAmount, 0);
  const balance     = totalBilled - totalPaid;

  const avatarBg = vendor.isActive
    ? "linear-gradient(135deg, #f59e0b, #d97706)"
    : "linear-gradient(135deg, #94a3b8, #64748b)";

  return (
    <div className="page-stack" style={{ maxWidth: "56rem" }}>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: vendor.name }]} />

      {/* Header */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{
              width: "3rem", height: "3rem", borderRadius: "0.75rem",
              background: avatarBg, display: "flex", alignItems: "center",
              justifyContent: "center", color: "#fff", fontSize: "1.125rem",
              fontWeight: 700, flexShrink: 0,
            }}>
              {vendor.name[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--c-text)", margin: 0 }}>{vendor.name}</h1>
                <span style={{
                  display: "inline-flex", padding: "0.1rem 0.5rem", borderRadius: "9999px",
                  fontSize: "0.7rem", fontWeight: 600,
                  background: vendor.isActive ? "var(--c-green-bg)" : "var(--c-bg-sub)",
                  color: vendor.isActive ? "var(--c-green-text)" : "var(--c-text-4)",
                  border: `1px solid ${vendor.isActive ? "var(--c-green-border, #bbf7d0)" : "var(--c-border)"}`,
                }}>
                  {vendor.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {vendor.company && (
                <div style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", marginTop: "0.125rem" }}>{vendor.company}</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.25rem" }}>
                {vendor.phone && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{vendor.phone}</span>}
                {vendor.email && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{vendor.email}</span>}
              </div>
              {vendor.gstin && (
                <code style={{
                  marginTop: "0.375rem", display: "inline-block", fontSize: "0.75rem",
                  background: "var(--c-bg-sub)", color: "var(--c-text-2)",
                  padding: "0.125rem 0.5rem", borderRadius: "0.375rem",
                  fontFamily: "var(--font-mono)", border: "1px solid var(--c-border)",
                }}>
                  GSTIN: {vendor.gstin}
                </code>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <Button variant="secondary" href={`/purchases/vendors/${id}/edit`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </Button>
            <Button variant="primary" href={`/purchases/bills/new?vendorId=${id}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Bill
            </Button>
          </div>
        </div>

        {(vendor.address || vendor.notes) && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--c-border)", display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
            {vendor.address && (
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem", fontWeight: 600 }}>Address</div>
                <p style={{ fontSize: "0.875rem", color: "var(--c-text-2)", margin: 0 }}>{vendor.address}</p>
              </div>
            )}
            {vendor.notes && (
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem", fontWeight: 600 }}>Notes</div>
                <p style={{ fontSize: "0.875rem", color: "var(--c-text-2)", margin: 0 }}>{vendor.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[
          { label: "Total Spend", value: fmt(totalBilled), sub: `${vendor.purchaseBills.length} bill(s)`, color: "var(--c-text)" },
          { label: "Total Paid",  value: fmt(totalPaid),   color: "var(--c-green-text)" },
          { label: "Balance",     value: fmt(balance),     color: balance > 0 ? "var(--c-amber)" : "var(--c-green-text)" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem", fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bill history */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
          <h2 style={{ fontWeight: 600, color: "var(--c-text)", fontSize: "0.875rem" }}>Bill History</h2>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Date</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendor.purchaseBills.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2.5rem", color: "var(--c-text-4)" }}>No bills yet.</td></tr>
              ) : vendor.purchaseBills.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/purchases/bills/${b.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                      {b.billNumber}
                    </Link>
                  </td>
                  <td style={{ color: "var(--c-text-3)" }}>
                    {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="table-td-right" style={{ color: "var(--c-text)" }}>{fmt(b.total)}</td>
                  <td className="table-td-right" style={{ color: "var(--c-green-text)" }}>{fmt(b.paidAmount)}</td>
                  <td className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>{fmt(b.total - b.paidAmount)}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
