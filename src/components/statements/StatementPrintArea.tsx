const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface StatementPrintRow {
  date: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}
interface StatementPrintAreaProps {
  party: {
    name: string; company?: string | null; address?: string | null; city?: string | null;
    state?: string | null; pincode?: string | null; phone?: string | null; email?: string | null; gstin?: string | null;
  };
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  balanceLabel: string; // "Receivable" or "Payable"
  positiveLabel: string; // e.g. "Due" (customer) or "Advance" (vendor)
  negativeLabel: string; // e.g. "Advance" (customer) or "Payable" (vendor)
  rows: StatementPrintRow[];
  settings: {
    name?: string; address?: string; city?: string; state?: string; pincode?: string;
    phone?: string; email?: string; gstin?: string; logoUrl?: string; showLogoOnInvoices?: boolean;
  } | null;
}

// Shared print/PDF markup for Customer & Vendor account statements — same generateInvoicePdfBlob()
// pipeline as invoices/rate lists (it only needs a <table>/<tbody> to compute page-split boundaries).
export function StatementPrintArea({ party, periodLabel, openingBalance, closingBalance, balanceLabel, positiveLabel, negativeLabel, rows, settings }: StatementPrintAreaProps) {
  const balTag = (n: number) => `${fmt(Math.abs(n))} ${n < 0 ? negativeLabel : positiveLabel}`;
  const showLogo = settings?.showLogoOnInvoices !== false;

  return (
    <>
      <style>{`
        #statement-print-area {
          --sp-bg:#fff; --sp-bg2:#f8fafc; --sp-bg3:#f1f5f9; --sp-bd:#475569; --sp-tx:#0f172a; --sp-tx2:#334155; --sp-tx3:#64748b;
        }
      `}</style>

      <div id="statement-print-area" style={{ position: "fixed", left: -9999, top: 0, width: 794, background: "var(--sp-bg)", color: "var(--sp-tx)", padding: "20px 14px", fontFamily: "Arial, sans-serif", overflowWrap: "break-word", wordBreak: "break-word" }} aria-hidden="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: `2px solid var(--sp-bd)`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--sp-tx)" }}>{settings?.name || "Science Hub"}</div>
            {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
              <div style={{ fontSize: 11, color: "var(--sp-tx3)", maxWidth: 320 }}>
                {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
              </div>
            )}
            {(settings?.phone || settings?.email) && (
              <div style={{ fontSize: 11, color: "var(--sp-tx3)" }}>
                {[settings?.phone && `Mobile: ${settings.phone}`, settings?.email && `Email: ${settings.email}`].filter(Boolean).join(" · ")}
              </div>
            )}
            {settings?.gstin && <div style={{ fontSize: 11, color: "var(--sp-tx3)" }}>GSTIN: {settings.gstin}</div>}
          </div>
          {showLogo && (
            <div style={{ flexShrink: 0, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- html2canvas needs a plain <img>, swapped to a data URL during PDF generation */}
              <img src={settings?.logoUrl || "/logo.png"} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--sp-tx)" }}>Account Statement</div>
          <div style={{ fontSize: 11, color: "var(--sp-tx3)", marginTop: 2 }}>{periodLabel}</div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 11.5 }}>
          <div style={{ fontWeight: 700, color: "var(--sp-tx)" }}>{party.name}{party.company ? ` (${party.company})` : ""}</div>
          {(party.address || party.city || party.state || party.pincode) && (
            <div style={{ color: "var(--sp-tx3)" }}>
              {[party.address, party.city, party.state, party.pincode].filter(Boolean).join(", ")}
            </div>
          )}
          {(party.phone || party.email) && (
            <div style={{ color: "var(--sp-tx3)" }}>
              {[party.phone, party.email].filter(Boolean).join(" · ")}
            </div>
          )}
          {party.gstin && <div style={{ color: "var(--sp-tx3)" }}>GSTIN: {party.gstin}</div>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "var(--sp-bg3)" }}>
              {["Date", "Particulars", "Debit (₹)", "Credit (₹)", "Balance (₹)"].map((h, i) => (
                <th key={h} style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", fontWeight: 700, background: "var(--sp-bg2)" }}>Opening Balance</td>
              <td style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", textAlign: "right", fontWeight: 700, background: "var(--sp-bg2)" }}>{balTag(openingBalance)}</td>
            </tr>
            {rows.map((r, idx) => {
              const rowBg = idx % 2 === 1 ? "var(--sp-bg2)" : "var(--sp-bg)";
              const td = (content: React.ReactNode, align: "left" | "right" = "left") => (
                <td style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", textAlign: align, background: rowBg }}>{content}</td>
              );
              return (
                <tr key={`${r.date}-${idx}`}>
                  {td(new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}
                  {td(r.label)}
                  {td(r.debit ? fmt(r.debit) : "—", "right")}
                  {td(r.credit ? fmt(r.credit) : "—", "right")}
                  {td(balTag(r.balance), "right")}
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", fontWeight: 700, background: "var(--sp-bg3)" }}>Closing Balance ({balanceLabel})</td>
              <td style={{ border: `1px solid var(--sp-bd)`, padding: "6px 4px", textAlign: "right", fontWeight: 700, background: "var(--sp-bg3)" }}>{balTag(closingBalance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
