"use client";

import { animateSection } from "@/lib/animateSection";
import { formatDate } from "@/lib/formatDate";
import { round2 } from "@/lib/roundOff";
import { fmt, type Invoice, type Payment, type ReturnRecord } from "@/components/invoices/invoiceDetailTypes";
import styles from "../invoiceDetail.module.css";

interface PaymentHistoryCardProps {
  invoice: Invoice;
  returns: ReturnRecord[];
  /** Invoice balance due, already rounded to paise by the page. */
  balance: number;
  canWrite: boolean;
  showPaymentInPdf: boolean;
  onTogglePdf: () => void;
  onEdit: (payment: Payment) => void;
  onDelete: (payment: Payment) => void;
}

export function PaymentHistoryCard({ invoice, returns, balance, canWrite, showPaymentInPdf, onTogglePdf, onEdit, onDelete }: PaymentHistoryCardProps) {
  if (invoice.payments.length === 0) return null;
  const METHOD_STYLE: Record<string, { bg: string; color: string; border: string }> = {
    Cash: { bg: "var(--c-green-bg)", color: "var(--c-green-text)", border: "var(--c-green-border)" },
    UPI: { bg: "#f3e8ff", color: "#7c3aed", border: "#ddd6fe" },
    IMPS: { bg: "var(--c-blue-bg)", color: "var(--c-blue)", border: "var(--c-blue-border)" },
    NEFT: { bg: "var(--c-blue-bg)", color: "var(--c-blue)", border: "var(--c-blue-border)" },
    RTGS: { bg: "var(--c-blue-bg)", color: "var(--c-blue)", border: "var(--c-blue-border)" },
    Cheque: { bg: "var(--c-amber-bg)", color: "var(--c-amber)", border: "var(--c-amber-border)" },
    Card: { bg: "#ede9fe", color: "#5b21b6", border: "#c4b5fd" },
    Other: { bg: "var(--c-bg-sub)", color: "var(--c-text-3)", border: "var(--c-border)" },
  };
  const paidTotal = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const totalReturned = returns.reduce((s, r) => s + r.total, 0);
  const netPaid = round2(paidTotal - totalReturned);
  const paidPct = Math.min(100, (paidTotal / invoice.total) * 100);

  return (
    <div {...animateSection(0, "card")}>
      {/* Header */}
      <div className={styles.historyHeader}>
        {/* Left: title + count */}
        <div className={styles.historyHeaderLeft}>
          <h2 className={styles.historyTitle}>Payment History</h2>
          <span className={styles.historyCountBadge}>
            {invoice.payments.length}
          </span>
        </div>
        {/* Right: toggle + stats */}
        <div className={styles.historyHeaderRight}>
          {/* Show in PDF toggle */}
          <button
            onClick={() => onTogglePdf()}
            title={showPaymentInPdf ? "Remove from PDF/Print" : "Include in PDF/Print"}
            className={`${styles.pdfToggleBtn} ${showPaymentInPdf ? styles.pdfToggleBtnActive : ""}`}
          >
            {showPaymentInPdf ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
            {showPaymentInPdf ? "Remove Payment History from PDF" : "Add Payment History to PDF"}
          </button>
          {/* Stats group — separated visually */}
          <div className={styles.historyStatsGroup}>
            <div>
              <div className={styles.historyStatLabel}>Total Paid</div>
              <div className={`${styles.historyStatValue} ${styles.historyStatValueGreen}`}>₹{fmt(paidTotal)}</div>
              {totalReturned > 0 && (
                <div className={styles.historyNetLine}>
                  <span className={styles.historyNetLineOrange}>− ₹{fmt(totalReturned)} returned</span>
                  <span className={styles.historyNetLineNet}> = ₹{fmt(netPaid)}</span>
                  <span> net</span>
                </div>
              )}
            </div>
            <div>
              <div className={styles.historyStatLabel}>Balance</div>
              <div className={styles.historyStatValue} style={{ color: balance > 0 ? "var(--c-red)" : "var(--c-green)" }}>₹{fmt(balance)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className={styles.progressRowWrap}>
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${paidPct}%`, background: paidPct >= 100 ? "var(--c-green)" : "var(--c-blue)" }} />
          </div>
          <span className={styles.progressLabel} style={{ color: paidPct >= 100 ? "var(--c-green-text)" : "var(--c-text-3)" }}>
            {paidPct.toFixed(0)}% paid
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Method</th>
              <th>Reference / UTR</th>
              <th className="table-th-right">Amount</th>
              {canWrite && <th className="table-th-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {[...invoice.payments]
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((p, idx) => {
                const ms = METHOD_STYLE[p.method] ?? METHOD_STYLE.Other;
                return (
                  <tr key={p.id}>
                    <td className={styles.payIdxCell}>{idx + 1}</td>
                    <td data-label="Date" className={styles.payDateCell}>
                      {formatDate(p.date)}
                    </td>
                    <td data-label="Method">
                      <span className={styles.methodBadge} style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.border}` }}>{p.method}</span>
                    </td>
                    <td data-label="Reference" className={styles.payReferenceCell}>
                      {p.reference || "—"}
                    </td>
                    <td data-label="Amount" className={`table-td-right ${styles.payAmountCell}`}>
                      ₹{fmt(p.amount)}
                    </td>
                    {canWrite && (
                      <td data-label="Actions" className="table-td-right">
                        <div className={styles.paymentActionsCell}>
                          <button
                            type="button"
                            className={styles.paymentEditBtn}
                            title="Edit payment"
                            aria-label="Edit payment"
                            onClick={() => onEdit(p)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button
                            type="button"
                            className={styles.paymentDeleteBtn}
                            title="Delete payment"
                            aria-label="Delete payment"
                            onClick={() => onDelete(p)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
