"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { fetchCached } from "@/lib/useCache";
import styles from "./vendorDetail.module.css";

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
    <div
      className={styles.skeletonBlock}
      style={{ width: w, height: h, borderRadius: r } as React.CSSProperties}
    />
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
    <div className={`page-stack ${styles.pageStack}`}>
      <Sk w={160} h={13} />
      <div className={`card ${styles.cardPad}`}>
        <div className={styles.skRow}>
          <Sk w={48} h={48} r={9999} />
          <div className={styles.skCol}>
            <Sk w={160} h={20} /><Sk w={220} h={13} /><Sk w={120} h={20} r={6} />
          </div>
        </div>
      </div>
      <div className={styles.statsGrid}>
        {[1,2,3].map(i => (
          <div key={i} className={`card ${styles.skStatCard}`}>
            <Sk w={80} h={11} /><Sk w={120} h={22} />
          </div>
        ))}
      </div>
      <div className="card">
        <div className={styles.skTableHead}><Sk w={120} h={14} /></div>
        <div className="table-wrap">
          <table className="table-base"><tbody><TableSkeleton cols={6} rows={4} /></tbody></table>
        </div>
      </div>
    </div>
  );

  if (error || !vendor)
    return <div className={`loading-center ${styles.errorCenter}`}>{error || "Vendor not found."}</div>;

  const totalBilled = vendor.purchaseBills.reduce((s, b) => s + b.total, 0);
  const totalPaid   = vendor.purchaseBills.reduce((s, b) => s + b.paidAmount, 0);
  const balance     = totalBilled - totalPaid;

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: vendor.name }]} />

      {/* Header */}
      <div className={`card ${styles.cardPad}`}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={vendor.isActive ? styles.avatarActive : styles.avatarInactive}>
              {vendor.name[0]?.toUpperCase()}
            </div>
            <div>
              <div className={styles.nameRow}>
                <h1 className={styles.name}>{vendor.name}</h1>
                <span className={`${styles.statusBadge} ${vendor.isActive ? styles.statusBadgeActive : styles.statusBadgeInactive}`}>
                  {vendor.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {vendor.company && (
                <div className={styles.company}>{vendor.company}</div>
              )}
              <div className={styles.contactRow}>
                {vendor.phone && <span className={styles.contactItem}>{vendor.phone}</span>}
                {vendor.email && <span className={styles.contactItem}>{vendor.email}</span>}
              </div>
              {vendor.gstin && (
                <code className={styles.gstinCode}>
                  GSTIN: {vendor.gstin}
                </code>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
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
          <div className={styles.detailsBlock}>
            {vendor.address && (
              <div>
                <div className={styles.detailLabel}>Address</div>
                <p className={styles.detailText}>{vendor.address}</p>
              </div>
            )}
            {vendor.notes && (
              <div>
                <div className={styles.detailLabel}>Notes</div>
                <p className={styles.detailText}>{vendor.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { label: "Total Spend", value: fmt(totalBilled), sub: `${vendor.purchaseBills.length} bill(s)`, tone: "" as "" | "positive" | "negative" },
          { label: "Total Paid",  value: fmt(totalPaid),   tone: "positive" as "" | "positive" | "negative" },
          { label: "Balance",     value: fmt(balance),     tone: (balance > 0 ? "negative" : "positive") as "" | "positive" | "negative" },
        ].map((s) => (
          <div key={s.label} className={`card ${styles.skStatCard}`}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={`${styles.statValue} ${s.tone === "positive" ? styles.positive : s.tone === "negative" ? styles.negative : ""}`}>{s.value}</div>
            {s.sub && <div className={styles.statSub}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bill history */}
      <div className="card">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Bill History</h2>
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
                <tr><td colSpan={6} className={styles.emptyCell}>No bills yet.</td></tr>
              ) : vendor.purchaseBills.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/purchases/bills/${b.id}`} className={styles.billLink}>
                      {b.billNumber}
                    </Link>
                  </td>
                  <td className={styles.dateCell}>
                    {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className={`table-td-right ${styles.totalCell}`}>{fmt(b.total)}</td>
                  <td className={`table-td-right ${styles.paidCell}`}>{fmt(b.paidAmount)}</td>
                  <td className={`table-td-right ${styles.balanceCell}`}>{fmt(b.total - b.paidAmount)}</td>
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
