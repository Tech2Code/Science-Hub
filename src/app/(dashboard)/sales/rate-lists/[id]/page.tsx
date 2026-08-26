"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Sk } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { Input, FormField } from "@/components/ui/Input";
import { rules, validate } from "@/lib/validation";
import { useToast } from "@/components/ui/Toast";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { getCachedPdf, setCachedPdf, invalidateCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { RateListPrintArea } from "@/components/rateLists/RateListPrintArea";
import { downloadXlsx } from "@/lib/downloadXlsx";
import { fmtCurrency } from "@/lib/rateListForm";
import { useCanWrite } from "@/lib/useCanWrite";
import { formatDate } from "@/lib/formatDate";
import styles from "./rateListDetail.module.css";

interface RateListItem {
  id: string; serialNo: number; name: string; brand: string | null; unit: string;
  isNetRate: boolean; discountPercent: number; listRate: number; amount: number;
}
interface RateList {
  id: string; title: string; note: string | null; createdAt: string; updatedAt: string;
  createdBy: { name: string };
  items: RateListItem[];
}
interface BusinessSettings {
  name?: string; address?: string; city?: string; state?: string; pincode?: string;
  phone?: string; email?: string; gstin?: string; logoUrl?: string; showLogoOnInvoices?: boolean; updatedAt?: string;
}

export default function RateListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCanWrite();

  const [rateList, setRateList] = useState<RateList | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pdfRegenerating, setPdfRegenerating] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfViewing, setPdfViewing] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareDropStyle, setShareDropStyle] = useState<React.CSSProperties>({});
  const shareContainerRef = useRef<HTMLDivElement>(null);

  // A rate list has no linked customer to default a recipient from (unlike
  // an invoice's customer.email) — always prompt for one.
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToError, setEmailToError] = useState<string | undefined>(undefined);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/rate-lists/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setError(d.error); setLoading(false); return; }
        setRateList(d); setLoading(false);
      })
      .catch(() => { setError("Failed to load rate list."); setLoading(false); });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- fetch-on-id-change; load() sets loading/rateList state
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  async function generateRateListPdfBlob(force = false): Promise<Blob | null> {
    if (!rateList) return null;
    const showLogo = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(undefined, { logo: showLogo, settings: settings?.updatedAt ?? "loading", updatedAt: rateList.updatedAt });
    if (!force) {
      const cached = await getCachedPdf("rate-list", rateList.id, variantKey);
      if (cached) return cached;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const el = document.getElementById("rate-list-print-area");
    const blob = el ? await generateInvoicePdfBlob(el, { logoUrl: showLogo ? settings?.logoUrl || undefined : undefined }) : null;
    if (blob) setCachedPdf("rate-list", rateList.id, variantKey, blob);
    return blob;
  }

  async function handleRegeneratePdf() {
    if (!rateList) return;
    setPdfRegenerating(true);
    const blob = await generateRateListPdfBlob(true);
    setPdfRegenerating(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
    toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
  }

  async function handleViewPdf() {
    if (!rateList) return;
    setPdfViewing(true);
    const blob = await generateRateListPdfBlob(false);
    setPdfViewing(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
  }

  async function handleDownloadPdf() {
    if (!rateList) return;
    setPdfDownloading(true);
    const blob = await generateRateListPdfBlob(false);
    setPdfDownloading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${rateList.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleExportExcel() {
    if (!rateList) return;
    setExportingExcel(true);
    try {
      await downloadXlsx(
        `${rateList.title.replace(/[^a-z0-9]+/gi, "-")}.xlsx`,
        rateList.title.slice(0, 31),
        ["#", "Item", "Brand", "Unit", "List Rate (₹)", "Discount", "Amount (₹)"],
        rateList.items.map((item, idx) => [
          idx + 1,
          item.name,
          item.brand ?? "",
          item.unit,
          item.listRate,
          item.isNetRate ? "Net Rate" : `${item.discountPercent}%`,
          item.amount,
        ])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    }
    setExportingExcel(false);
  }

  async function handleShare(channel: "native" | "whatsapp" | "email") {
    setShareOpen(false);
    if (!rateList) return;
    if (channel === "email") {
      setEmailTo("");
      setEmailToError(undefined);
      setEmailModalOpen(true);
      return;
    }
    setShareLoading(true);
    const blob = await generateRateListPdfBlob(false);
    setShareLoading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const fileName = `${rateList.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });

    const downloadPdf = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    if (channel === "native") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: rateList.title });
        } else {
          downloadPdf();
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
      }
      return;
    }

    if (channel === "whatsapp") {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: rateList.title, text: rateList.title });
        } catch (err) {
          if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
        }
      } else {
        toast({ type: "error", title: "Not supported", message: "File sharing is not supported on this browser." });
      }
      return;
    }

  }

  // Splits the comma-separated recipient field into individual addresses so
  // a rate list can be sent to more than one email in a single send,
  // mirroring how the server itself validates and forwards the list to
  // nodemailer's `to`.
  function parseEmailList(raw: string): string[] {
    return raw.split(",").map(e => e.trim()).filter(Boolean);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!rateList) return;
    const emails = parseEmailList(emailTo);
    if (emails.length === 0) { setEmailToError("Enter at least one email address."); return; }
    if (emails.length > 10) { setEmailToError("You can send to at most 10 recipients at once."); return; }
    for (const addr of emails) {
      const err = validate(addr, rules.email());
      if (err) { setEmailToError(`"${addr}" is not a valid email address.`); return; }
    }
    setEmailToError(undefined);
    setSendingEmail(true);
    try {
      const blob = await generateRateListPdfBlob(false);
      if (!blob) {
        toast({ type: "error", title: "Failed", message: "Could not generate PDF." });
        setSendingEmail(false);
        return;
      }
      const formData = new FormData();
      formData.append("pdf", blob, `${rateList.title}.pdf`);
      formData.append("to", emails.join(","));
      formData.append("title", rateList.title);
      const res = await fetch("/api/send-rate-list", { method: "POST", body: formData });
      if (res.ok) {
        toast({ type: "success", title: "Email sent", message: `"${rateList.title}" sent to ${emails.join(", ")}` });
        setEmailModalOpen(false);
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Email failed", message: d.error ?? "Could not send email." });
      }
    } catch {
      toast({ type: "error", title: "Email failed", message: "Network error. Could not send email." });
    }
    setSendingEmail(false);
  }

  async function handleDelete() {
    if (!rateList) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rate-lists/${rateList.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await invalidateCachedPdf("rate-list", rateList.id);
        toast({ type: "success", title: "Moved to bin", message: `"${rateList.title}" moved to bin. You can restore it within 30 days.` });
        router.push("/sales/rate-lists");
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete rate list." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="page-stack">
        <Sk h={24} w="16rem" />
        <Sk h={160} />
        <Sk h={320} />
      </div>
    );
  }
  if (error || !rateList) {
    return (
      <div className="page-stack">
        <p className={styles.errorMsg}>{error || "Rate list not found."}</p>
        <Button variant="secondary" href="/sales/rate-lists">Back to Rate Lists</Button>
      </div>
    );
  }

  const total = rateList.items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
    {(pdfDownloading || pdfViewing) && <OverlayLoader text={pdfDownloading ? "Generating PDF…" : "Opening preview…"} />}
    {pdfRegenerating && <OverlayLoader text="Regenerating PDF…" />}
    {shareLoading && <OverlayLoader text="Preparing PDF…" />}
    {sendingEmail && <OverlayLoader text="Sending email…" />}
    {exportingExcel && <OverlayLoader text="Generating Excel file…" />}

    {pdfPreviewUrl && (
      <PdfPreviewModal
        url={pdfPreviewUrl}
        fileName={rateList.title}
        title={rateList.title}
        onClose={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
      />
    )}

    <ConfirmDialog
      open={confirmDelete}
      title="Move to Bin"
      message={`Move "${rateList.title}" to bin? You can restore it within 30 days.`}
      confirmLabel="Move to Bin"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => { if (!deleting) setConfirmDelete(false); }}
    />

    <Modal
      open={emailModalOpen}
      title="Email Rate List"
      onClose={() => { if (!sendingEmail) setEmailModalOpen(false); }}
      variant="fullscreen"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={sendingEmail} onClick={() => setEmailModalOpen(false)}>Cancel</Button>
          <Button type="submit" form="rate-list-email-form" variant="primary" loading={sendingEmail} disabled={sendingEmail}>Send</Button>
        </>
      }
    >
      <form id="rate-list-email-form" onSubmit={handleSendEmail} noValidate>
        <FormField label="Recipient Email(s)" required error={emailToError} hint="Separate multiple addresses with commas.">
          <Input
            type="text"
            value={emailTo}
            onChange={(e) => { setEmailTo(e.target.value); setEmailToError(undefined); }}
            placeholder="customer@example.com, accounts@example.com"
            maxLength={1000}
            autoFocus
            disabled={sendingEmail}
          />
        </FormField>
      </form>
    </Modal>

    <RateListPrintArea rateList={rateList} settings={settings} />

    <div className="page-stack">
      <div className="page-header">
        <div>
          <Breadcrumb items={[{ label: "Rate Lists", href: "/sales/rate-lists" }, { label: rateList.title }]} />
          <div className={styles.metaText}>
            {rateList.items.length} item{rateList.items.length === 1 ? "" : "s"} · Created by {rateList.createdBy.name} · {formatDate(rateList.createdAt)}
          </div>
        </div>
        <div className={styles.toolbarActions}>
          {canWrite && (
            <Button variant="editOutline" size="sm" href={`/sales/rate-lists/${rateList.id}/edit`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </Button>
          )}
          <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" onClick={handleRegeneratePdf}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </Button>
          <Button variant="viewOutline" size="sm" onClick={handleViewPdf} loading={pdfViewing}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} loading={pdfDownloading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportExcel} loading={exportingExcel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="17"/><line x1="15" y1="13" x2="9" y2="17"/></svg>
            Export Excel
          </Button>
          <div className={styles.shareWrap} ref={shareContainerRef}>
            <Button variant="secondary" size="sm" disabled={shareLoading} onClick={() => {
              setShareOpen((o) => {
                const next = !o;
                if (next && shareContainerRef.current) {
                  const rect = shareContainerRef.current.getBoundingClientRect();
                  const dropW = 220;
                  const viewW = window.innerWidth;
                  let right = viewW - rect.right;
                  if (viewW - right - dropW < 8) right = viewW - dropW - 8;
                  right = Math.max(8, right);
                  setShareDropStyle({ position: "fixed", top: rect.bottom + 8, right });
                }
                return next;
              });
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.shareIconMargin}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share PDF
            </Button>
            {shareOpen && (
              <>
                <div className={styles.shareOverlay} onClick={() => setShareOpen(false)} />
                <div className={styles.shareMenu} style={shareDropStyle}>
                  <div className={styles.shareMenuTitle}>Share PDF</div>
                  {([
                    typeof navigator !== "undefined" && "share" in navigator ? {
                      key: "native", label: "Share / Send File",
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
                      color: "var(--c-blue)",
                    } : null,
                    {
                      key: "whatsapp", label: "WhatsApp",
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                      color: "#25d366",
                    },
                    {
                      key: "email", label: "Email",
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
                      color: "var(--c-text-2)",
                    },
                  ] as const).filter(Boolean).map((opt) => (
                    <button
                      key={opt!.key}
                      onClick={() => handleShare(opt!.key as "native" | "whatsapp" | "email")}
                      className={styles.shareMenuItem}
                    >
                      <span className={styles.shareMenuItemIcon} style={{ color: opt!.color }}>{opt!.icon}</span>
                      {opt!.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {canWrite && (
            <Button variant="dangerOutline" size="sm" onClick={() => setConfirmDelete(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </Button>
          )}
        </div>
      </div>

      {rateList.note && <p className={styles.noteBanner}>{rateList.note}</p>}

      <div className="card">
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th><th>Item</th><th>Brand</th><th>Unit</th>
                <th className="table-th-right">List Rate (₹)</th>
                <th className="table-th-right">Discount</th>
                <th className="table-th-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rateList.items.map((item, idx) => (
                <tr key={item.id}>
                  <td data-label="#">{idx + 1}</td>
                  <td data-label="Item">{item.name}</td>
                  <td data-label="Brand">{item.brand || <span className={styles.emptyValue}>—</span>}</td>
                  <td data-label="Unit">{item.unit}</td>
                  <td data-label="List Rate (₹)" className="table-td-right">₹{fmtCurrency(item.listRate)}</td>
                  <td data-label="Discount" className="table-td-right">{item.isNetRate ? "Net Rate" : `${item.discountPercent}%`}</td>
                  <td data-label="Amount (₹)" className="table-td-right">₹{fmtCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className={`table-th-right ${styles.totalLabel}`}>Total</td>
                <td className={`table-th-right ${styles.totalValue}`}>₹{fmtCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}
