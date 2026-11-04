"use client";

import { animateSection } from "@/lib/animateSection";
import { formatDate } from "@/lib/formatDate";
import { fmt, returnItemRate, type ReturnRecord } from "@/components/invoices/invoiceDetailTypes";
import styles from "../invoiceDetail.module.css";

interface ReturnHistoryCardProps {
  returns: ReturnRecord[];
  canWrite: boolean;
  showReturnInPdf: boolean;
  onTogglePdf: () => void;
  /** id of the credit note whose PDF is currently being generated (disables its download button). */
  creditNoteDownloadingId: string | null;
  onDownload: (ret: ReturnRecord) => void;
  onDelete: (ret: ReturnRecord) => void;
}

export function ReturnHistoryCard({ returns, canWrite, showReturnInPdf, onTogglePdf, creditNoteDownloadingId, onDownload, onDelete }: ReturnHistoryCardProps) {
  if (returns.length === 0) return null;
  const totalReturned = returns.reduce((s, r) => s + r.total, 0);
  return (
    <div {...animateSection(1, `card ${styles.returnsHistoryCard}`)}>
      <div className={styles.returnsHistoryHeader}>
        <div className={styles.returnsHistoryHeaderLeft}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
          <span className={styles.returnsHistoryTitle}>Return History</span>
          <span className={styles.returnsCountBadge}>{returns.length}</span>
        </div>
        <div className={styles.historyHeaderRight}>
          <button
            onClick={() => onTogglePdf()}
            title={showReturnInPdf ? "Remove from PDF/Print" : "Include in PDF/Print"}
            className={`${styles.pdfToggleBtn} ${showReturnInPdf ? styles.pdfToggleBtnActive : styles.pdfToggleBtnOrange}`}
          >
            {showReturnInPdf ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
            {showReturnInPdf ? "Remove Return History from PDF" : "Add Return History to PDF"}
          </button>
          <div className={styles.returnsHistoryTotal}>₹{fmt(totalReturned)} returned</div>
        </div>
      </div>
      <div className={styles.returnsList}>
        {returns.map((ret, ridx) => (
          <div key={ret.id} className={ridx < returns.length - 1 ? styles.returnEntry : styles.returnEntryLast}>
            <div className={styles.returnEntryHead}>
              <div className={styles.returnEntryHeadLeft}>
                {ret.creditNoteNumber && <span className={styles.creditNoteNumberBadge}>{ret.creditNoteNumber}</span>}
                <span className={styles.returnEntryDate}>
                  {formatDate(ret.date)}
                </span>
                {ret.notes && <span className={styles.returnEntryNotes}>— {ret.notes}</span>}
              </div>
              <div className={styles.returnEntryHeadRight}>
                <span className={styles.returnEntryTotal}>₹{fmt(ret.total)}</span>
                <button
                  type="button"
                  className={styles.returnDeleteBtn}
                  title="Download credit note PDF"
                  aria-label="Download credit note PDF"
                  disabled={creditNoteDownloadingId === ret.id}
                  onClick={() => onDownload(ret)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </button>
                {canWrite && (
                  <button
                    type="button"
                    className={styles.returnDeleteBtn}
                    title="Delete credit note"
                    aria-label="Delete credit note"
                    onClick={() => onDelete(ret)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div className={styles.returnItemsGroup}>
              {ret.items.map(ri => (
                <div key={ri.id} className={styles.returnLineItem}>
                  <span className={styles.returnLineItemName}>
                    {ri.name}
                    <span className={styles.returnLineItemQty}> ×{ri.quantity}</span>
                    <span className={styles.returnLineItemPrice}> @ ₹{fmt(returnItemRate(ri))}</span>
                    {ri.gstRate > 0 && <span className={styles.returnLineItemPrice}> + {ri.gstRate}% GST</span>}
                  </span>
                  <span className={styles.returnLineItemTotal}>₹{fmt(ri.total)}</span>
                </div>
              ))}
            </div>
            <div className={styles.returnTaxSummary}>
              Taxable ₹{fmt(ret.subtotal)}
              {ret.igst > 0 ? ` · IGST ₹${fmt(ret.igst)}` : ` · CGST ₹${fmt(ret.cgst)} · SGST ₹${fmt(ret.sgst)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
