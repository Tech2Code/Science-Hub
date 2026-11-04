"use client";

import styles from "../invoiceDetail.module.css";

// Loading placeholder for the invoice detail page — mirrors its loaded layout (toolbar + invoice paper).
// Keep in sync with page.tsx / InvoicePrintArea.tsx whenever the loaded layout changes.
function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "var(--c-border)",
      animation: "skPulse 1.4s ease-in-out infinite",
    }} />
  );
}

export function InvoiceDetailSkeleton() {
  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <div className="page-stack">

        {/* Toolbar — breadcrumb + 7 action buttons */}
        <div className={styles.skToolbarRow}>
          <div className={styles.skFlexGap5}>
            <Sk w={70} h={13} r={4} />
            <Sk w={8} h={13} r={2} />
            <Sk w={110} h={13} r={4} />
          </div>
          <div className={styles.skActionsRow}>
            <Sk w={64} h={20} r={10} />
            <Sk w={28} h={28} r={6} />
            <Sk w={100} h={28} r={6} />
            <Sk w={118} h={28} r={6} />
            <Sk w={105} h={28} r={6} />
            <Sk w={95} h={28} r={6} />
            <Sk w={62} h={28} r={6} />
            <Sk w={85} h={28} r={6} />
            <Sk w={90} h={28} r={6} />
          </div>
        </div>

        {/* Invoice print area */}
        <div className={`card ${styles.skCard}`}>
          {/* TAX INVOICE header bar */}
          <Sk w="100%" h={40} r={0} />

          <div className={styles.skTwoCol}>
            {/* Left: company info */}
            <div className={styles.skCompanyCol}>
              <div className={styles.skFlexGap5}>
                <Sk w={36} h={36} r={4} />
                <Sk w={130} h={16} r={4} />
              </div>
              <Sk w="80%" h={11} r={3} />
              <Sk w="65%" h={11} r={3} />
              <Sk w="50%" h={11} r={3} />
            </div>
            {/* Right: invoice meta rows */}
            <div className={styles.skMetaCol}>
              {["Invoice No.", "Date", "Supply Type"].map(label => (
                <div key={label} className={styles.skMetaRow}>
                  <Sk w="70%" h={11} r={3} />
                  <Sk w="85%" h={11} r={3} />
                </div>
              ))}
            </div>
          </div>

          {/* Bill To section */}
          <div className={styles.skBillTo}>
            <Sk w={60} h={10} r={3} />
            <Sk w={180} h={14} r={3} />
            <Sk w={220} h={11} r={3} />
            <div className={styles.skBillToRow}>
              <Sk w={100} h={11} r={3} />
              <Sk w={160} h={11} r={3} />
            </div>
          </div>

          {/* Items table header */}
          <div className={styles.skTableHeader}>
            {Array.from({ length: 14 }).map((_, i) => <Sk key={i} w="75%" h={10} r={3} />)}
          </div>

          {/* Item rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skTableRow}>
              <Sk w="60%" h={12} r={3} />
              <Sk w="85%" h={12} r={3} />
              <Sk w="70%" h={12} r={3} />
              <Sk w="70%" h={12} r={3} />
              <Sk w="80%" h={12} r={3} />
              <Sk w="80%" h={12} r={3} />
              <Sk w="60%" h={12} r={3} />
              <Sk w="75%" h={12} r={3} />
              <Sk w="75%" h={12} r={3} />
              <Sk w="85%" h={12} r={3} />
              <Sk w="60%" h={12} r={3} />
              <Sk w="80%" h={12} r={3} />
              <Sk w="60%" h={12} r={3} />
              <Sk w="85%" h={12} r={3} />
            </div>
          ))}

          {/* Totals rows */}
          <div className={styles.skTotalsRow}>
            <div className={styles.skTotalsLeft}>
              <Sk w="60%" h={11} r={3} />
            </div>
            <div className={styles.skTotalsRight}>
              {["Subtotal", "CGST", "SGST", "Round Off", "Grand Total", "Amount in Words", "Paid", "Balance Due"].map(label => (
                <div key={label} className={styles.skTotalsLine}>
                  <Sk w="60%" h={11} r={3} />
                  <Sk w="70%" h={11} r={3} />
                </div>
              ))}
            </div>
          </div>

          {/* Footer bar */}
          <Sk w="100%" h={34} r={0} />
        </div>

      </div>
    </>
  );
}
