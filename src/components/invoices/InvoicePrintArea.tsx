"use client";

import { amountInWordsINR } from "@/lib/numberToWords";
import { splitGstForDisplay } from "@/lib/roundOff";
import { formatDate } from "@/lib/formatDate";
import { fmt, returnItemRate, type BusinessSettings, type Invoice, type ReturnRecord } from "./invoiceDetailTypes";

interface InvoicePrintAreaProps {
  invoice: Invoice;
  settings: BusinessSettings | null;
  returns: ReturnRecord[];
  /** Invoice balance due, already rounded to paise by the page. */
  balance: number;
  showPaymentInPdf: boolean;
  showReturnInPdf: boolean;
}

/**
 * The invoice "paper": shown on the detail page AND the single source html2canvas captures to build the
 * PDF (see generateInvoicePdf.ts). Pure presentation — all data comes in through props.
 *
 * Contracts with generateInvoicePdf.ts / pdfIframeGenerator.ts that must not be renamed or restructured
 * without updating them: id="invoice-print-area", id="invoice-copy-badge"/data-role="copy-badge",
 * the single <thead> (banner), the row marked data-header-item-cols="true", every item row marked
 * data-invoice-item-row, and the <tfoot>. The --inv-* CSS variables it uses are defined once in
 * PrintAreaStyles.tsx — any page that mounts this component must also render <PrintAreaStyles />.
 */
export function InvoicePrintArea({ invoice, settings, returns, balance, showPaymentInPdf, showReturnInPdf }: InvoicePrintAreaProps) {
  return (
      <div id="invoice-print-area"
        style={{ background: "var(--inv-bg)", color: "var(--inv-tx)", borderRadius: "0.75rem", boxShadow: "var(--c-shadow-sm)" }}>
        <div style={{ overflowX: "auto" }}>
          {/* minWidth keeps the printable layout's proportions intact on
              narrow screens — without it the table shrinks to the
              viewport width instead of triggering the scroll wrapper
              above, and the nowrap header/cell text gets visually
              clipped by neighboring cells instead of staying legible. */}
          {/* overflowWrap inherits down to every cell (address, GSTIN,
              phone/email, place of supply, etc.) so a long unbreakable
              token wraps instead of spilling past the cell/table edge —
              which html2canvas would otherwise capture as content
              bleeding outside the page during PDF generation. The
              customer-name divs override this locally with nowrap +
              ellipsis, which still wins for that single line. */}
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 9, overflowWrap: "break-word", wordBreak: "break-word" }}>
            {/* ── Letterhead header ── */}
            <thead>
              <tr>
                <th colSpan={invoice.isInterState ? 12 : 14}
                  style={{ padding: 0, background: "var(--inv-bg)", fontWeight: "normal" }}>
                  {/* Thin top bar: copy label only (no border — only the
                      block below is boxed) */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "flex-end",
                    padding: "4px 14px",
                    fontSize: 9, color: "var(--inv-tx3)"
                  }}>
                    {/* "Original Copy" by default on screen; overwritten to
                        "ORIGINAL COPY"/"DUPLICATE COPY" per pass during PDF
                        generation / printing — data-role survives node cloning
                        (ids get stripped there). */}
                    <span id="invoice-copy-badge" data-role="copy-badge" style={{
                      textAlign: "right",
                      fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--inv-tx2)"
                    }}>
                      Original Copy
                    </span>
                  </div>
                  {/* Logo + company block */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "10px 20px",
                    borderTop: "1px solid var(--inv-bd)", borderLeft: "1px solid var(--inv-bd)",
                    borderRight: "1px solid var(--inv-bd)", borderBottom: "1px solid var(--inv-bd)"
                  }}>
                    {settings?.showLogoOnInvoices !== false && (
                      <div style={{ flexShrink: 0, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- html2canvas needs a plain <img>, swapped to a data URL during PDF/print generation */}
                        <img src={settings?.logoUrl || "/logo.png"} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      </div>
                    )}
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--inv-tx2)", marginBottom: 3
                      }}>
                        Tax Invoice
                      </div>
                      <div style={{
                        fontSize: 17, fontWeight: 800, letterSpacing: "0.02em",
                        color: "var(--inv-tx)", marginBottom: 3, lineHeight: 1.2
                      }}>
                        {settings?.name}
                      </div>
                      {settings?.tagline && (
                        <div style={{ fontSize: 10, color: "var(--inv-tx2)", marginBottom: 2 }}>{settings.tagline}</div>
                      )}
                      {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
                        <div style={{ fontSize: 10, color: "var(--inv-tx2)", marginBottom: 2 }}>
                          {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {(settings?.phone || settings?.email) && (
                        <div style={{ fontSize: 10, color: "var(--inv-tx2)", marginBottom: 2 }}>
                          {[settings?.phone && `Mobile: ${settings.phone}`, settings?.email && `Email: ${settings.email}`]
                            .filter(Boolean).join("  |  ")}
                        </div>
                      )}
                      {(settings?.gstin || settings?.pan) && (
                        <div style={{ fontSize: 10, color: "var(--inv-tx2)", fontFamily: "monospace" }}>
                          {[settings?.gstin && `GSTIN - ${settings.gstin}`, settings?.pan && `PAN - ${settings.pan}`]
                            .filter(Boolean).join("  |  ")}
                        </div>
                      )}
                    </div>
                    {settings?.showLogoOnInvoices !== false && <div style={{ flexShrink: 0, width: 60 }} aria-hidden="true" />}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ── Invoice meta ── */}
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--inv-bg2)" }}>Invoice No.</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", fontWeight: 700, color: "var(--inv-tx)" }}>{invoice.invoiceNumber}</td>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--inv-bg2)" }}>Invoice Date</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx2)" }}>
                  {formatDate(invoice.date)}
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--inv-bg2)" }}>Due Date</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx2)" }}>
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                </td>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--inv-bg2)" }}>Place of Supply</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx2)" }}>
                  {invoice.placeOfSupply || invoice.customer.state || "—"}
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, background: "var(--inv-bg2)" }}>Supply Type</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{
                  border: "1px solid var(--inv-bd)", padding: "8px 14px",
                  color: invoice.isInterState ? "var(--inv-blue)" : "var(--inv-green)", fontWeight: 600
                }}>
                  {invoice.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}
                </td>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, background: "var(--inv-bg2)" }}>Reverse Charge</td>
                <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx2)", fontWeight: 600 }}>
                  {invoice.reverseCharge ? "Yes" : "No"}
                </td>
              </tr>
              {invoice.ewayBillNumber && (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx3)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--inv-bg2)" }}>E-way Bill No.</td>
                  <td colSpan={invoice.isInterState ? 4 : 5} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px", color: "var(--inv-tx2)", fontWeight: 600, fontFamily: "monospace" }}>
                    {invoice.ewayBillNumber}
                  </td>
                  {/* Filler — completes the row to the table's real total width (allCols: 12/14,
                      same constant the header/totals rows use), so the right edge stays bordered
                      instead of blank. */}
                  <td colSpan={invoice.isInterState ? 6 : 7} style={{ border: "1px solid var(--inv-bd)", padding: "8px 14px" }} />
                </tr>
              )}

              {/* ── Buyer: Bill To / Ship To ── */}
              <tr>
                <td colSpan={invoice.isInterState ? 6 : 7}
                  style={{ border: "1px solid var(--inv-bd)", padding: 0, verticalAlign: "top" }}>
                  <div style={{
                    background: "var(--inv-bg3)", padding: "5px 14px", fontSize: 10, fontWeight: 700,
                    color: "var(--inv-tx2)", borderBottom: "1px solid var(--inv-bd)"
                  }}>
                    Buyer (Bill to)
                  </div>
                  <div style={{ padding: "10px 14px", lineHeight: 1.75, fontSize: 10.5 }}>
                    {/* nowrap+ellipsis doesn't clip inside an auto-layout
                        table — the cell just grows to fit the unwrapped
                        text instead, pushing the whole table (and PDF
                        page) wider. Let it wrap/break like the address
                        below it, which the table's own overflowWrap
                        already handles correctly. */}
                    <div style={{ fontWeight: 700, fontSize: 12, color: "var(--inv-tx)", marginBottom: 2 }} title={invoice.customer.name}>
                      {invoice.customer.name}
                    </div>
                    {invoice.customer.address && (
                      <div style={{ color: "var(--inv-tx2)", width: 340 }}>{invoice.customer.address}</div>
                    )}
                    {(invoice.customer.city || invoice.customer.state) && (
                      <div style={{ color: "var(--inv-tx2)" }}>
                        {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {invoice.customer.pincode && (
                      <div style={{ color: "var(--inv-tx2)" }}>{invoice.customer.pincode}</div>
                    )}
                    {(invoice.customer.phone || invoice.customer.email) && (
                      <div style={{ color: "var(--inv-tx3)", marginTop: 2 }}>
                        {[invoice.customer.phone && `Ph: ${invoice.customer.phone}`,
                        invoice.customer.email && `Email: ${invoice.customer.email}`]
                          .filter(Boolean).join("  |  ")}
                      </div>
                    )}
                    <div style={{ marginTop: 6, borderTop: "1px solid var(--inv-bd)", paddingTop: 5 }}>
                      {(invoice.placeOfSupply || invoice.customer.state) && (
                        <div style={{ fontWeight: 600, color: "var(--inv-tx)", fontSize: 10 }}>
                          Place of Supply : {invoice.placeOfSupply || invoice.customer.state}
                        </div>
                      )}
                      {invoice.customer.gstin && (
                        <div style={{ fontWeight: 600, color: "var(--inv-tx)", fontSize: 10 }}>
                          GST Number : {invoice.customer.gstin}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td colSpan={invoice.isInterState ? 6 : 7}
                  style={{ border: "1px solid var(--inv-bd)", padding: 0, verticalAlign: "top" }}>
                  <div style={{
                    background: "var(--inv-bg3)", padding: "5px 14px", fontSize: 10, fontWeight: 700,
                    color: "var(--inv-tx2)", borderBottom: "1px solid var(--inv-bd)"
                  }}>
                    Buyer (Ship to)
                  </div>
                  <div style={{ padding: "10px 14px", lineHeight: 1.75, fontSize: 10.5 }}>
                    {/* nowrap+ellipsis doesn't clip inside an auto-layout
                        table — the cell just grows to fit the unwrapped
                        text instead, pushing the whole table (and PDF
                        page) wider. Let it wrap/break like the address
                        below it, which the table's own overflowWrap
                        already handles correctly. */}
                    <div style={{ fontWeight: 700, fontSize: 12, color: "var(--inv-tx)", marginBottom: 2 }} title={invoice.customer.name}>
                      {invoice.customer.name}
                    </div>
                    {invoice.customer.address && (
                      <div style={{ color: "var(--inv-tx2)", width: 340 }}>{invoice.customer.address}</div>
                    )}
                    {(invoice.customer.city || invoice.customer.state) && (
                      <div style={{ color: "var(--inv-tx2)" }}>
                        {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {invoice.customer.pincode && (
                      <div style={{ color: "var(--inv-tx2)" }}>{invoice.customer.pincode}</div>
                    )}
                    {(invoice.customer.phone || invoice.customer.email) && (
                      <div style={{ color: "var(--inv-tx3)", marginTop: 2 }}>
                        {[invoice.customer.phone && `Ph: ${invoice.customer.phone}`,
                        invoice.customer.email && `Email: ${invoice.customer.email}`]
                          .filter(Boolean).join("  |  ")}
                      </div>
                    )}
                    <div style={{ marginTop: 6, borderTop: "1px solid var(--inv-bd)", paddingTop: 5 }}>
                      {(invoice.placeOfSupply || invoice.customer.state) && (
                        <div style={{ fontWeight: 600, color: "var(--inv-tx)", fontSize: 10 }}>
                          Place of Supply : {invoice.placeOfSupply || invoice.customer.state}
                        </div>
                      )}
                      {invoice.customer.gstin && (
                        <div style={{ fontWeight: 600, color: "var(--inv-tx)", fontSize: 10 }}>
                          GST Number : {invoice.customer.gstin}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>

              {/* Items header — a single real row (no rowSpan anywhere): html2canvas doesn't
                  compute rowSpan cell heights correctly, which cut off/hid borders in the
                  generated PDF even though it rendered fine on screen. The CGST/SGST/IGST group
                  cells still colSpan the same 2 underlying data columns below them (colSpan
                  renders fine), but their Rate/Amount sub-labels are nested inline via flex
                  instead of living in a second table row.
                  `data-header-item-cols="true"` marks this row for generateInvoicePdf.ts's
                  page-split logic: on a continuation page that still has item rows on it, this
                  row is redrawn stacked right under the repeating banner (so the columns are
                  still labeled past page 1) — but on a continuation page that's purely the
                  trailing Notes/Bank/Terms/Totals block with no item rows, only the banner
                  repeats and this row is skipped (column headers with nothing under them would
                  look broken there). Deliberately kept in <tbody>, immediately above the actual
                  item rows — NOT in <thead> — so it stays visually right above where the items
                  start on page 1 (after Invoice No./Bill To/Place of Supply etc.), instead of
                  jumping to the very top of the table under the banner the way anything inside
                  <thead> unavoidably would. */}
              {(() => {
                const taxGroup = (label: string, width: string) => (
                  <td key={label} colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", width, whiteSpace: "nowrap" }}>
                    <div style={{ textAlign: "center" }}>{label}</div>
                    <div style={{ display: "flex", fontSize: 7, gap: 6, margin: "5px -4px 0", borderTop: "1px solid var(--inv-bd)", padding: "5px 5px 0 5px" }}>
                      <div style={{ flex: "1.3", textAlign: "left" }}>Rate</div>
                      <div style={{ flex: 1, textAlign: "left" }}>Amount</div>
                    </div>
                  </td>
                );
                return (
                  <tr id="invoice-col-header" data-header-item-cols="true" style={{ background: "var(--inv-bg3)", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--inv-tx2)" }}>
                    {[
                      ["#", "center", "3%"], ["Description", "left", "7%"], ["HSN/SAC", "center", "8%"],
                      ["Qty", "center", "5%"], ["Unit", "center", "10%"],
                    ].map(([label, align, width]) => (
                      <td key={label} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: align as "left" | "right" | "center", width, whiteSpace: "nowrap", verticalAlign: "middle" }}>{label}</td>
                    ))}
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "center", width: "11%", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      <div>List</div><div>Price(₹)</div>
                    </td>
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "center", width: "9%", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      <div>Total</div><div>Value (₹)</div>
                    </td>
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "center", width: "2%", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      <div>Discount</div><div>%</div>
                    </td>
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", width: "7%", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      <div>Taxable (₹)</div>
                    </td>
                    {invoice.isInterState
                      ? taxGroup("IGST", "9%")
                      : <>{taxGroup("CGST", "8%")}{taxGroup("SGST", "8%")}</>
                    }
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", width: "8%", whiteSpace: "nowrap", verticalAlign: "middle" }}>Amount (₹)</td>
                  </tr>
                );
              })()}

              {/* Item rows */}
              {invoice.items.map((item, idx) => {
                const discountAmount = item.discountAmount ?? 0;
                const grossValue = item.quantity * item.price;
                const taxable = grossValue - discountAmount;
                // Same helper the invoice/credit-note footers already use to split a combined GST
                // amount for display — a naive item.gstAmount/2 independently rounds each half and
                // can print a row whose own CGST+SGST don't foot to that row's own Amount column
                // (e.g. gstAmount=10.01 -> both halves round to 5.01, printing 10.02).
                const { cgst: itemCgst, sgst: itemSgst } = splitGstForDisplay(item.gstAmount);
                const halfRate = item.gstRate / 2;
                const rowBg = idx % 2 === 1 ? "var(--inv-bg2)" : "var(--inv-bg)";
                const c = (content: React.ReactNode, align: "left" | "right" | "center" = "center", bold = false, width?: string, nowrap = false) => (
                  <td style={{
                    border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: align, width,
                    fontWeight: bold ? 700 : undefined, background: rowBg, color: bold ? "var(--inv-tx)" : "var(--inv-tx2)",
                    ...(nowrap ? { whiteSpace: "nowrap" as const } : {})
                  }}>
                    {content}
                  </td>
                );
                return (
                  <tr key={item.id} data-invoice-item-row="true">
                    {c(idx + 1, "center", false, "3%", true)}
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 6px", width: "13%", background: rowBg, fontWeight: 600, color: "var(--inv-tx)" }}>
                      {/* TEST: 2-line clamp instead of the previous
                          fixed-1-line-height ellipsis, to see how the
                          page-split math in generateInvoicePdf.ts
                          (ROW_SAFETY_MARGIN_PX) copes with rows whose
                          height now legitimately varies (1 line vs 2). The
                          div still needs its own definite px width (see
                          prior comment) so overflow/line-clamp measure
                          against a fixed column width, not the text's own
                          length. */}
                      <div style={{
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        overflow: "hidden", textOverflow: "ellipsis",
                        width: 145, maxWidth: "100%",
                      }} title={item.name}>{item.name}</div>
                    </td>
                    <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "center", background: rowBg, color: "var(--inv-tx2)" }}>
                      {/* Real HSN/SAC codes are numeric-only, max 8 digits
                          (2/4/6/8-digit HSN hierarchy, or 6-digit SAC) —
                          they never legitimately need to wrap. The server
                          still allows up to 50 chars as a generic safety
                          bound (route.ts), so a fixed single-line ellipsis
                          (rather than the item-name's 2-line clamp) guards
                          against a stray long/garbage value wrapping
                          unpredictably and reintroducing the same row-
                          height page-split risk. 55px comfortably fits 8
                          digits at this font size with room to spare. */}
                      <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", width: 55, maxWidth: "100%", margin: "0 auto" }} title={item.hsn || "—"}>
                        {item.hsn || "—"}
                      </div>
                    </td>
                    {c(item.quantity, "center", false, undefined, true)}{c(item.unit, "center", false, undefined, true)}
                    {c(fmt(item.price), "right", false, undefined, true)}
                    {c(fmt(grossValue), "right", false, undefined, true)}
                    {c(`${(item.discountPercent ?? 0).toFixed(2)}%`, "center", false, undefined, true)}
                    {c(fmt(taxable), "right", false, undefined, true)}
                    {invoice.isInterState
                      ? <>{c(`${item.gstRate}%`, "center", false, "4.5%", true)}{c(fmt(item.gstAmount), "right", false, undefined, true)}</>
                      : <>{c(`${halfRate}%`, "center", false, "4.5%", true)}{c(fmt(itemCgst), "right", false, undefined, true)}{c(`${halfRate}%`, "center", false, "4.5%", true)}{c(fmt(itemSgst), "right", false, undefined, true)}</>}
                    {c(fmt(item.total), "right", true, undefined, true)}
                  </tr>
                );
              })}

              {/* Transportation Charges — its own row right after the item
                  rows end, broken into Taxable/CGST+SGST(or IGST)/Amount
                  columns exactly like an item row, rather than a single
                  merged amount+GST figure, so its tax is as visible as any
                  product line's. Kept out of the Notes+Totals merged block
                  below so it reads as "one more line item". */}
              {!!invoice.transportCharge && invoice.transportCharge > 0 && (() => {
                const tcTaxable = invoice.transportCharge ?? 0;
                const tcGst = invoice.transportChargeGstAmount ?? 0;
                const tcRate = invoice.transportChargeGstRate ?? 0;
                const tcHalfRate = tcRate / 2;
                const tcHalfGst = tcGst / 2;
                const tcTd = (content: React.ReactNode, bold = false, align: "right" | "center" = "right") => (
                  <td style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: align, background: "var(--inv-bg)", fontWeight: bold ? 700 : undefined, color: bold ? "var(--inv-tx)" : "var(--inv-tx2)", whiteSpace: "nowrap" }}>
                    {content}
                  </td>
                );
                return (
                  <tr>
                    <td colSpan={8} style={{ border: "1px solid var(--inv-bd)", padding: "5px 6px", background: "var(--inv-bg)", fontWeight: 600, color: "var(--inv-tx)" }}>
                      Transportation Charges
                    </td>
                    {tcTd(fmt(tcTaxable))}
                    {invoice.isInterState
                      ? <>{tcTd(`${tcRate}%`, false, "center")}{tcTd(fmt(tcGst))}</>
                      : <>{tcTd(`${tcHalfRate}%`, false, "center")}{tcTd(fmt(tcHalfGst))}{tcTd(`${tcHalfRate}%`, false, "center")}{tcTd(fmt(tcHalfGst))}</>}
                    {tcTd(fmt(tcTaxable + tcGst), true)}
                  </tr>
                );
              })()}

              {/* Notes + Totals — rowSpan must equal the exact number of
                  rows this merged Notes cell needs to cover: Subtotal +
                  Grand Total + Amount in Words + Paid + Balance Due (5,
                  always present) + tax rows (1 for IGST, 2 for CGST+SGST)
                  + Round Off (only when non-zero). A stale/hardcoded count
                  here desyncs the table the moment Round Off is nonzero —
                  the rows past the rowSpan's end silently lose their left
                  offset and collapse against the table's left edge. */}
              <tr data-invoice-summary-start="true">
                <td colSpan={8} rowSpan={5 + (invoice.isInterState ? 1 : 2) + (invoice.roundOff !== 0 ? 1 : 0)}
                  style={{ border: "1px solid var(--inv-bd)", padding: "14px 16px", verticalAlign: "top", color: "var(--inv-tx3)" }}>
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 120 }}>
                    <div style={{ marginTop: "auto" }}>
                      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                        {settings?.termsAndConditions?.trim() && (
                          <div style={{ flex: 1.37, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, marginBottom: 4, color: "var(--inv-tx2)" }}>Terms &amp; Conditions</div>
                            <ol style={{ margin: 0, paddingLeft: 14, fontSize: 9.5, lineHeight: 1.5 }}>
                              {settings.termsAndConditions.split("\n").map((line, i) => line.trim() && <li key={i}>{line.trim()}</li>)}
                            </ol>
                          </div>
                        )}
                        {(settings?.bankName || settings?.bankAccountNumber) && (() => {
                          const bankRow = (label: string, value?: string) => value && (
                            <div>
                              <span style={{ fontWeight: 600, color: "var(--inv-tx2)" }}>{label} : </span>
                              <span style={{ fontWeight: 700 }}>{value}</span>
                            </div>
                          );
                          const hasTerms = Boolean(settings?.termsAndConditions?.trim());
                          return (
                            <div style={{ flex: 1, minWidth: 0, ...(hasTerms ? { borderLeft: "1px solid var(--inv-bd2)", paddingLeft: 14 } : {}) }}>
                              <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, marginBottom: 5, color: "var(--inv-tx2)" }}>Bank Details</div>
                              <div style={{ fontSize: 10.5, lineHeight: 1.75, color: "var(--inv-tx)" }}>
                                {bankRow("Bank", settings.bankName)}
                                {bankRow("A/C Name", settings.bankAccountName)}
                                {bankRow("A/C No", settings.bankAccountNumber)}
                                {bankRow("IFSC", settings.bankIfsc)}
                                {bankRow("Branch", settings.bankBranch)}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {invoice.notes && (
                        <><div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, marginBottom: 4, color: "var(--inv-tx2)" }}>Notes</div><p>{invoice.notes}</p></>
                      )}
                      <p style={{ marginTop: 10, fontSize: 9.5, opacity: 0.55 }}>**Disclaimer:** This is a computer-generated invoice; please verify all details and calculations, as errors or discrepancies may occur.</p>
                      <div style={{ marginTop: 16, borderTop: "1px solid var(--inv-bd2)", paddingTop: 8, display: "flex", justifyContent: "space-between", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--inv-tx2)", marginBottom: 20 }}>For {settings?.name}</div>
                          <div style={{ fontSize: 9, color: "var(--inv-tx3)" }}>Authorised Signatory</div>
                        </div>
                        {/* Shown only on the Duplicate Copy pass — toggled in
                            generateInvoicePdf.ts's onclone via visibility (not
                            display), same mechanism as #invoice-copy-badge, so
                            this row's layout space is always reserved and every
                            copy's canvas height matches the pre-loop measurement.
                            Original/no-label copies keep it invisible. */}
                        <div id="invoice-receiver-signature" data-role="receiver-signature" style={{ visibility: "hidden", textAlign: "right" }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--inv-tx2)", marginBottom: 20 }}>&nbsp;</div>
                          <div style={{ fontSize: 9, color: "var(--inv-tx3)" }}>Receiver Signature</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>Subtotal</td>
                <td colSpan={invoice.isInterState ? 2 : 4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>₹{fmt(invoice.subtotal)}</td>
              </tr>
              {/* Transportation Charges' own IGST/CGST/SGST (shown split
                  out on its own row above) must be folded into these
                  footer totals too, or "Total CGST"/"Total SGST" would
                  silently under-report the tax actually charged on the
                  invoice whenever a transport charge is present. */}
              {invoice.isInterState ? (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>Total IGST</td>
                  <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>₹{fmt(invoice.igst + (invoice.transportChargeGstAmount ?? 0))}</td>
                </tr>
              ) : (() => {
                // Split the combined CGST+SGST once (not each half independently) so the two
                // printed rows always foot back to the printed Grand Total — see
                // splitGstForDisplay's own comment for why independently rounding invoice.cgst
                // and invoice.sgst (both exact halves in raw float math) can silently print
                // ₹0.01 more than the actual total GST on an odd-paisa invoice.
                const { cgst: cgstDisplay, sgst: sgstDisplay } = splitGstForDisplay(invoice.cgst + invoice.sgst + (invoice.transportChargeGstAmount ?? 0));
                return (
                  <>
                    <tr>
                      <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>Total CGST</td>
                      <td colSpan={4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>₹{fmt(cgstDisplay)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>Total SGST</td>
                      <td colSpan={4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>₹{fmt(sgstDisplay)}</td>
                    </tr>
                  </>
                );
              })()}
              {invoice.roundOff !== 0 && (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>Round Off</td>
                  <td colSpan={invoice.isInterState ? 2 : 4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)" }}>{invoice.roundOff > 0 ? "+" : "−"}₹{fmt(Math.abs(invoice.roundOff))}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", fontWeight: 700, color: "var(--inv-tx)", background: "var(--inv-bg4)", fontSize: 12 }}>Grand Total</td>
                <td colSpan={invoice.isInterState ? 2 : 4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", fontWeight: 700, color: "var(--inv-tx)", background: "var(--inv-bg4)", fontSize: 12 }}>₹{fmt(invoice.total)}</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-tx3)", background: "var(--inv-bg2)", fontSize: 9.5, fontStyle: "italic" }}>Amount in Words</td>
                <td colSpan={invoice.isInterState ? 2 : 4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-tx2)", background: "var(--inv-bg2)", fontSize: 9.5, fontStyle: "italic" }}>{amountInWordsINR(invoice.total)}</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", color: "var(--inv-green)", background: "var(--inv-bg2)" }}>Paid</td>
                <td colSpan={invoice.isInterState ? 2 : 4} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", color: "var(--inv-green)", fontWeight: 600, background: "var(--inv-bg2)" }}>₹{fmt(invoice.paidAmount)}</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: "1px solid var(--inv-bd)", padding: "5px 4px", fontWeight: 700, color: "var(--inv-tx)", background: "var(--inv-bg3)" }}>Balance Due</td>
                <td colSpan={invoice.isInterState ? 2 : 4} style={{
                  border: "1px solid var(--inv-bd)", padding: "5px 4px", textAlign: "right", fontWeight: 700, fontSize: 12.5, background: "var(--inv-bg3)",
                  color: balance > 0 ? "var(--inv-red)" : "var(--inv-green)"
                }}>₹{fmt(balance)}</td>
              </tr>

            </tbody>

            {/* PDF payment history — direct rows in main table to avoid double borders */}
            {showPaymentInPdf && invoice.payments.length > 0 && (() => {
              const sorted = [...invoice.payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const allCols = invoice.isInterState ? 12 : 14;
              // Reference/UTR and Amount columns are sized so the divider between
              // them lands on the same underlying column boundary as the Grand
              // Total / Balance Due label|value divider above — the notes cell
              // (colSpan 8, fixed for both supply types) plus the label (colSpan 2)
              // always puts that divider after 10 real columns, so Date+Method+Ref
              // must also total 10 in both states; Amount absorbs the difference
              // between inter-state (12 total) and intra-state (14, since CGST/SGST
              // each carry their own Rate+Amount sub-columns).
              const refCols = 6;
              const amountCols = invoice.isInterState ? 2 : 4;
              const bd: React.CSSProperties = { border: "1px solid var(--inv-bd)", padding: "5px 10px", fontSize: 10 };
              return (
                <tbody>
                  <tr>
                    <td colSpan={allCols} style={{ ...bd, padding: "7px 14px", background: "var(--inv-bg3)", color: "var(--inv-tx)", fontWeight: 700, fontSize: 10.5 }}>
                      Payment History
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Date</td>
                    <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Method</td>
                    <td colSpan={refCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Reference / UTR</td>
                    <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Amount (₹)</td>
                  </tr>
                  {sorted.map((p) => (
                    <tr key={p.id}>
                      <td colSpan={2} style={{ ...bd, color: "var(--inv-tx2)" }}>
                        {formatDate(p.date)}
                      </td>
                      <td colSpan={2} style={{ ...bd, color: "var(--inv-tx2)" }}>{p.method}</td>
                      <td colSpan={refCols} style={{ ...bd, color: "var(--inv-tx2)" }}>{p.reference || "—"}</td>
                      <td colSpan={amountCols} style={{ ...bd, textAlign: "right", color: "var(--inv-green)", fontWeight: 600 }}>{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })()}

            {showReturnInPdf && returns.length > 0 && (() => {
              const allCols = invoice.isInterState ? 12 : 14;
              // Column widths are tuned so two dividers line up with the tables
              // above: Item|Qty×Rate lands on the same column boundary as the
              // Grand Total/Balance Due label|value split (the notes cell is now
              // always colSpan 8), and Qty×Rate|Amount lands on the same boundary
              // as Payment History's Reference|Amount divider (also now fixed,
              // since both boundaries above are fixed for both supply types).
              const itemCols = 4;
              const qtyRateCols = 2;
              const gstCols = 2;
              const amountCols = invoice.isInterState ? 2 : 4;
              const bd: React.CSSProperties = { border: "1px solid var(--inv-bd)", padding: "5px 10px", fontSize: 10 };
              const totalSubtotal = returns.reduce((s, r) => s + r.subtotal, 0);
              const totalCgst = returns.reduce((s, r) => s + r.cgst, 0);
              const totalSgst = returns.reduce((s, r) => s + r.sgst, 0);
              const totalIgst = returns.reduce((s, r) => s + r.igst, 0);
              const totalRoundOff = returns.reduce((s, r) => s + r.roundOff, 0);
              const totalReturnedAmt = returns.reduce((s, r) => s + r.total, 0);
              return (
                <tbody>
                  <tr>
                    <td colSpan={allCols} style={{ ...bd, padding: "7px 14px", background: "var(--inv-bg3)", color: "var(--inv-tx)", fontWeight: 700, fontSize: 10.5 }}>
                      Return History
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Date</td>
                    <td colSpan={itemCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Item</td>
                    <td colSpan={qtyRateCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Qty × Rate</td>
                    <td colSpan={gstCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>GST</td>
                    <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Amount (₹)</td>
                  </tr>
                  {returns.map((ret) =>
                    ret.items.map((ri, riIdx) => (
                      <tr key={`${ret.id}-${ri.id}`}>
                        {riIdx === 0 && (
                          <td colSpan={2} rowSpan={ret.items.length} style={{ ...bd, color: "var(--inv-tx2)", verticalAlign: "top" }}>
                            {ret.creditNoteNumber && <div style={{ fontWeight: 600, color: "var(--inv-tx)" }}>{ret.creditNoteNumber}</div>}
                            {formatDate(ret.date)}
                            {ret.notes ? <div style={{ fontSize: 10, color: "var(--inv-tx3)", marginTop: 2 }}>{ret.notes}</div> : null}
                          </td>
                        )}
                        <td colSpan={itemCols} style={{ ...bd, color: "var(--inv-tx2)" }}>{ri.name}</td>
                        <td colSpan={qtyRateCols} style={{ ...bd, color: "var(--inv-tx3)" }}>{ri.quantity} × ₹{fmt(returnItemRate(ri))}</td>
                        <td colSpan={gstCols} style={{ ...bd, textAlign: "right", color: "var(--inv-tx3)" }}>{ri.gstRate}% ({fmt(ri.gstAmount)})</td>
                        <td colSpan={amountCols} style={{ ...bd, textAlign: "right", color: "var(--inv-red)", fontWeight: 600 }}>−{fmt(ri.total)}</td>
                      </tr>
                    ))
                  )}
                  <tr>
                    <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>Taxable Value</td>
                    <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>−{fmt(totalSubtotal)}</td>
                  </tr>
                  {totalIgst > 0 ? (
                    <tr>
                      <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>IGST</td>
                      <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>−{fmt(totalIgst)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>CGST</td>
                        <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>−{fmt(totalCgst)}</td>
                      </tr>
                      <tr>
                        <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>SGST</td>
                        <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>−{fmt(totalSgst)}</td>
                      </tr>
                    </>
                  )}
                  {totalRoundOff !== 0 && (
                    <tr>
                      <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>Round Off</td>
                      <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", textAlign: "right" }}>{totalRoundOff > 0 ? "−" : "+"}{fmt(Math.abs(totalRoundOff))}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Total Returned</td>
                    <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-red)", fontWeight: 700, textAlign: "right" }}>
                      −{fmt(totalReturnedAmt)}
                    </td>
                  </tr>
                </tbody>
              );
            })()}

            <tfoot>
              <tr>
                <td colSpan={invoice.isInterState ? 12 : 14}
                  style={{ border: "1px solid var(--inv-bd)", padding: "8px 16px", textAlign: "center", fontSize: 9.5, color: "var(--inv-tx3)", background: "var(--inv-bg2)" }}>
                  Thank you for your business · {settings?.name}{settings?.email ? ` · ${settings.email}` : ""}{settings?.phone ? ` · ${settings.phone}` : ""}
                </td>
              </tr>
            </tfoot>
          </table>
          {/* No page-marker element here on purpose — "Page No. X of Y" is
              drawn directly onto the generated PDF's canvas in a reserved
              band below the tfoot (see generateInvoicePdf.ts), computed
              from the table's own measured edges rather than a live DOM
              node, so the on-screen detail page never shows any such text
              and there's nothing here that could go stale/desync. */}
        </div>

      </div>
  );
}
