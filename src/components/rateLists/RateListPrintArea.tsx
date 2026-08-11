import { fmtCurrency } from "@/lib/rateListForm";

interface RateListItem {
  id: string; name: string; brand: string | null; unit: string;
  isNetRate: boolean; discountPercent: number; listRate: number; amount: number;
}
interface RateListPrintAreaProps {
  rateList: {
    title: string;
    note: string | null;
    createdAt: string;
    items: RateListItem[];
  };
  settings: {
    name?: string; address?: string; city?: string; state?: string; pincode?: string;
    phone?: string; email?: string; gstin?: string; logoUrl?: string; showLogoOnInvoices?: boolean;
  } | null;
}

// Shared print/PDF markup for a Rate List — used by both the detail page
// (always mounted) and the list page (mounted on-demand for the Preview
// button, then torn down). generateInvoicePdfBlob() only needs a <table>
// with <tbody> rows to compute page splits; the invoice-specific bells
// (thead/tfoot repeat, page markers, copy stamping) are optional and simply
// don't apply here.
export function RateListPrintArea({ rateList, settings }: RateListPrintAreaProps) {
  const showLogo = settings?.showLogoOnInvoices !== false;

  return (
    <>
      <style>{`
        #rate-list-print-area {
          --rp-bg:#fff; --rp-bg2:#f8fafc; --rp-bg3:#f1f5f9; --rp-bd:#475569; --rp-tx:#0f172a; --rp-tx2:#334155; --rp-tx3:#64748b;
        }
      `}</style>

      <div id="rate-list-print-area" style={{ position: "fixed", left: -9999, top: 0, width: 794, background: "var(--rp-bg)", color: "var(--rp-tx)", padding: "20px 14px", fontFamily: "Arial, sans-serif", overflowWrap: "break-word", wordBreak: "break-word" }} aria-hidden="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: `2px solid var(--rp-bd)`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--rp-tx)" }}>{settings?.name || "Science Hub"}</div>
            {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
              <div style={{ fontSize: 11, color: "var(--rp-tx3)", maxWidth: 320 }}>
                {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
              </div>
            )}
            {(settings?.phone || settings?.email) && (
              <div style={{ fontSize: 11, color: "var(--rp-tx3)" }}>
                {[settings?.phone && `Mobile: ${settings.phone}`, settings?.email && `Email: ${settings.email}`].filter(Boolean).join(" · ")}
              </div>
            )}
            {settings?.gstin && <div style={{ fontSize: 11, color: "var(--rp-tx3)" }}>GSTIN: {settings.gstin}</div>}
          </div>
          {showLogo && (
            <div style={{ flexShrink: 0, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- html2canvas needs a plain <img>, swapped to a data URL during PDF generation */}
              <img src={settings?.logoUrl || "/logo.png"} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--rp-tx)" }}>{rateList.title}</div>
          {rateList.note && <div style={{ fontSize: 11, color: "var(--rp-tx3)", marginTop: 2 }}>{rateList.note}</div>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "var(--rp-bg3)" }}>
              {["S.No.", "Item", "Brand", "Unit", "List Rate (₹)", "Discount", "Amount (₹)"].map((h, i) => (
                <th key={h} style={{ border: `1px solid var(--rp-bd)`, padding: "6px 4px", textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rateList.items.map((item, idx) => {
              const rowBg = idx % 2 === 1 ? "var(--rp-bg2)" : "var(--rp-bg)";
              const td = (content: React.ReactNode, align: "left" | "right" = "left") => (
                <td style={{ border: `1px solid var(--rp-bd)`, padding: "6px 4px", textAlign: align, background: rowBg }}>{content}</td>
              );
              return (
                <tr key={item.id}>
                  {td(idx + 1)}
                  {td(item.name)}
                  {td(item.brand || "—")}
                  {td(item.unit)}
                  {td(fmtCurrency(item.listRate), "right")}
                  {td(item.isNetRate ? "Net Rate" : `${item.discountPercent}%`, "right")}
                  {td(fmtCurrency(item.amount), "right")}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
