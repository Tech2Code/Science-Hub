// CSS variables the invoice and credit-note print areas read (--inv-*), light and dark. Rendered by every page that
// mounts either print area — the invoice detail page, and any list page that renders a document PDF off-screen via
// useInvoicePdfRenderer(). Moved verbatim out of sales/invoices/[id]/page.tsx. (generateInvoicePdf.ts strips the
// "dark" class from its capture clone, so PDFs are always the light variant regardless of the viewer's theme.)
export function PrintAreaStyles() {
  return <style>{`
        #invoice-print-area, #credit-note-print-area {
          --inv-bg:#fff;--inv-bg2:#f8fafc;--inv-bg3:#f1f5f9;--inv-bg4:#e2e8f0;
          --inv-bd:#475569;--inv-bd2:#94a3b8;
          --inv-tx:#0f172a;--inv-tx2:#334155;--inv-tx3:#64748b;
          --inv-brand:#1e3a8a;--inv-green:#059669;--inv-blue:#2563eb;--inv-red:#dc2626;
        }
        .dark #invoice-print-area, .dark #credit-note-print-area {
          --inv-bg:#0f172a;--inv-bg2:#1e293b;--inv-bg3:#1e293b;--inv-bg4:#334155;
          --inv-bd:#475569;--inv-bd2:#334155;
          --inv-tx:#f1f5f9;--inv-tx2:#cbd5e1;--inv-tx3:#94a3b8;
          --inv-brand:#93c5fd;--inv-green:#34d399;--inv-blue:#60a5fa;--inv-red:#f87171;
        }
      `}</style>;
}
