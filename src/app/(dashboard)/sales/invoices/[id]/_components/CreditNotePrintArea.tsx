"use client";

import type { CSSProperties } from "react";
import { amountInWordsINR } from "@/lib/numberToWords";
import { splitGstForDisplay } from "@/lib/roundOff";
import { formatDate } from "@/lib/formatDate";
import { fmt, returnItemRate, type BusinessSettings, type Invoice, type ReturnRecord } from "@/components/invoices/invoiceDetailTypes";

// Use createdAt (always a full server timestamp) for display rather than date
// (which is a user-picked date-only value stored as UTC midnight).
function parseDate(d: string) {
  return new Date(d);
}

interface CreditNotePrintAreaProps {
  ret: ReturnRecord;
  invoice: Invoice;
  settings: BusinessSettings | null;
}

/**
 * Credit note "paper" — mounted off-screen only while a credit note PDF is being generated, then fed to the
 * same generateInvoicePdfBlob() pipeline as the main invoice via id="credit-note-print-area". The --inv-*
 * CSS variables it uses are defined once in PrintAreaStyles.tsx (the detail page renders <PrintAreaStyles />).
 */
export function CreditNotePrintArea({ ret, invoice, settings }: CreditNotePrintAreaProps) {
  return (
    <div id="credit-note-print-area" style={{
      position: "absolute", left: -9999, top: 0,
      width: 700, background: "var(--inv-bg)", color: "var(--inv-tx)",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
        {/* Letterhead + credit-note-meta + column-header rows live in a real <thead> (this
            print area previously had none at all) so generateInvoicePdf.ts's page-split
            logic repeats them on every continuation page of a long credit note, the same
            way the main invoice print area's own header repeats. */}
        <thead>
          <tr>
            <td colSpan={6} style={{ padding: "10px 20px", border: "1px solid var(--inv-bd)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {settings?.showLogoOnInvoices !== false && (
                  <div style={{ flexShrink: 0, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- html2canvas needs a plain <img>, swapped to a data URL during PDF generation */}
                    <img src={settings?.logoUrl || "/logo.png"} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                )}
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--inv-tx2)", marginBottom: 3 }}>
                    Credit Note
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "var(--inv-tx)", marginBottom: 3 }}>{settings?.name}</div>
                  {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
                    <div style={{ fontSize: 10, color: "var(--inv-tx2)", marginBottom: 2 }}>
                      {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {(settings?.gstin || settings?.pan) && (
                    <div style={{ fontSize: 10, color: "var(--inv-tx2)", fontFamily: "monospace" }}>
                      {[settings?.gstin && `GSTIN - ${settings.gstin}`, settings?.pan && `PAN - ${settings.pan}`].filter(Boolean).join("   ")}
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
          {settings?.licenses && settings.licenses.length > 0 && (
            <tr>
              <td colSpan={6} style={{ padding: "5px 20px", border: "1px solid var(--inv-bd)" }}>
                <div
                  data-role="credit-note-licenses-strip"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px 28px",
                    fontSize: 10,
                  }}
                >
                  {settings.licenses.map((lic, idx) => (
                    <span key={idx} style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--inv-tx3)", fontWeight: 500 }}>
                        {`${lic.label.replace(/\s*[-:]+\s*$/, "")} - `}
                      </span>
                      <span style={{ color: "var(--inv-tx2)", fontWeight: 600 }}>
                        {lic.number}
                      </span>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={6} style={{ padding: "10px 20px", border: "1px solid var(--inv-bd)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <div>
                  <div><strong>Credit Note No.:</strong> {ret.creditNoteNumber ?? "—"}</div>
                  <div><strong>Date:</strong> {formatDate(parseDate(ret.date))}</div>
                  <div><strong>Against Invoice:</strong> {invoice.invoiceNumber} ({formatDate(parseDate(invoice.date))})</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div><strong>Customer:</strong> {invoice.customer.name}</div>
                  {invoice.customer.gstin && <div style={{ fontFamily: "monospace" }}>GSTIN: {invoice.customer.gstin}</div>}
                  {invoice.customer.address && <div>{[invoice.customer.address, invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}</div>}
                </div>
              </div>
            </td>
          </tr>
          <tr style={{ background: "var(--inv-bg2)" }}>
            {["Item", "Qty", "Rate", "GST %", "GST Amt", "Total"].map((h, i) => (
              <td key={h} style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", fontWeight: 700, fontSize: 9.5, textAlign: i === 0 ? "left" : "right" }}>{h}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {ret.items.map((ri) => (
            <tr key={ri.id}>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)" }}>{ri.name}</td>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", textAlign: "right" }}>{ri.quantity}</td>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", textAlign: "right" }}>{fmt(returnItemRate(ri))}</td>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", textAlign: "right" }}>{ri.gstRate}%</td>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", textAlign: "right" }}>{fmt(ri.gstAmount)}</td>
              <td style={{ padding: "6px 10px", border: "1px solid var(--inv-bd2)", textAlign: "right" }}>{fmt(ri.total)}</td>
            </tr>
          ))}
          {(() => {
            const cnTotalsRows = 1 + (invoice.isInterState ? 1 : 2) + (ret.roundOff !== 0 ? 1 : 0) + 1;
            const cnLabelCell: CSSProperties = { border: "1px solid var(--inv-bd)", padding: "5px 8px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" };
            const cnValueCell: CSSProperties = { ...cnLabelCell, textAlign: "right" };
            // Same reconciliation fix as the main invoice footer — round the combined
            // CGST+SGST once instead of each half independently, so the two printed rows
            // always foot back to the printed credit-note Total.
            const { cgst: cnCgstDisplay, sgst: cnSgstDisplay } = splitGstForDisplay(ret.cgst + ret.sgst);
            return (
              <>
                <tr data-invoice-summary-start="true">
                  <td colSpan={4} rowSpan={cnTotalsRows} style={{ border: "1px solid var(--inv-bd)", padding: "10px 12px", verticalAlign: "top", fontSize: 9.5, color: "var(--inv-tx3)" }}>
                    <div style={{ fontStyle: "italic" }}><strong>Amount in Words:</strong> {amountInWordsINR(ret.total)}</div>
                    {ret.notes && <div style={{ marginTop: 6 }}><strong>Notes:</strong> {ret.notes}</div>}
                  </td>
                  <td style={cnLabelCell}>Taxable Value</td>
                  <td style={cnValueCell}>₹{fmt(ret.subtotal)}</td>
                </tr>
                {invoice.isInterState ? (
                  <tr>
                    <td style={cnLabelCell}>IGST</td>
                    <td style={cnValueCell}>₹{fmt(ret.igst)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td style={cnLabelCell}>CGST</td>
                      <td style={cnValueCell}>₹{fmt(cnCgstDisplay)}</td>
                    </tr>
                    <tr>
                      <td style={cnLabelCell}>SGST</td>
                      <td style={cnValueCell}>₹{fmt(cnSgstDisplay)}</td>
                    </tr>
                  </>
                )}
                {ret.roundOff !== 0 && (
                  <tr>
                    <td style={cnLabelCell}>Round Off</td>
                    <td style={cnValueCell}>{ret.roundOff > 0 ? "+" : "−"}₹{fmt(Math.abs(ret.roundOff))}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ ...cnLabelCell, fontWeight: 700, color: "var(--inv-tx)", background: "var(--inv-bg4)", fontSize: 12 }}>Total</td>
                  <td style={{ ...cnValueCell, fontWeight: 700, color: "var(--inv-tx)", background: "var(--inv-bg4)", fontSize: 12 }}>₹{fmt(ret.total)}</td>
                </tr>
              </>
            );
          })()}
        </tbody>
        <tfoot>
          <tr>
            <td
              colSpan={6}
              style={{
                border: "1px solid var(--inv-bd)",
                padding: "8px 16px",
                textAlign: "center",
                fontSize: 9.5,
                color: "var(--inv-tx3)",
                background: "var(--inv-bg2)",
              }}
            >
              Thank you for your business · {settings?.name}{settings?.email ? ` · ${settings.email}` : ""}{settings?.phone ? ` · ${settings.phone}` : ""}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
