"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { animateSection } from "@/lib/animateSection";
import styles from "./gstFiling.module.css";

interface SalesRegisterRow {
  invoiceNumber: string; date: string; customerName: string; customerGstin: string;
  placeOfSupply: string; supplyType: string; isB2B: boolean;
  taxableValue: number; cgst: number; sgst: number; igst: number; total: number;
}
interface ValidationIssue { severity: "error" | "warning"; category: string; message: string; reference?: string; }
interface CreditNoteRow { returnId: string; total: number; }
interface GstFilingReport {
  period: { startDate: string; endDate: string; label: string };
  company: { name: string; gstin: string; gstinValid: boolean };
  salesRegister: SalesRegisterRow[];
  b2bSales: SalesRegisterRow[];
  b2cSales: SalesRegisterRow[];
  creditNotes: CreditNoteRow[];
  purchaseRegister: unknown[];
  hsnSummary: unknown[];
  summary: {
    outputTaxable: number; outputTax: number; creditNoteTax: number; netOutputTax: number;
    inputTaxable: number; inputTax: number; netGstPayable: number;
  };
  validation: { issues: ValidationIssue[]; errorCount: number; warningCount: number };
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Builds a "YYYY-MM-DD" string from local calendar fields directly — never
// round-trip through toISOString() here. That converts to UTC, and since
// this app is India-only (UTC+5:30), a locally-constructed local midnight
// (e.g. April 1st IST) lands on the *previous* UTC day, silently shifting
// every period boundary back by one day.
function ymd(year: number, month1to12: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayStr() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function currentFyStartYear() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, 1);
}

function periodFromFy(fyStart: number) {
  return { startDate: ymd(fyStart, 4, 1), endDate: ymd(fyStart + 1, 3, 31) };
}

export default function GstFilingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    const sections = session.user?.sections ?? [];
    if (!sections.includes("reports_sales") || !sections.includes("reports_purchases")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const fyOptions = Array.from({ length: 6 }, (_, i) => currentFyStartYear() - i);

  const [mode, setMode] = useState<"month" | "fy">("month");
  // Defaults to "1st of this month → today" for the common case (current
  // month, up to date) — both ends stay freely editable to any date, so a
  // custom multi-month range (a quarter, say) is just picking a wider "To".
  const [fromDate, setFromDate] = useState(firstDayOfCurrentMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [fyStart, setFyStart] = useState(currentFyStartYear());

  const [report, setReport] = useState<GstFilingReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period = mode === "month" ? { startDate: fromDate, endDate: toDate } : periodFromFy(fyStart);

  function switchMode(next: "month" | "fy") {
    setMode(next);
    setReport(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/gst-filing?startDate=${period.startDate}&endDate=${period.endDate}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to generate the GST filing preview."); return; }
      setReport(data);
    } catch {
      setError("Failed to generate the GST filing preview.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gst-filing?startDate=${period.startDate}&endDate=${period.endDate}&format=zip`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to download the GST package.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `GST-Package-${period.startDate}_to_${period.endDate}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download the GST package.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">GST Reports</h1>
          <p className="page-sub">Generate a complete GST return package — Sales Register, Purchase Register, Credit Notes, HSN Summary &amp; GST Summary — ready to send to your CA</p>
        </div>
      </div>

      {/* Period selector */}
      <div {...animateSection(0, "card")}>
        <div className="card-header">
          <div>
            <h2 className="card-header-title">Return Period</h2>
            <p className="card-header-sub">Choose the month or financial year to file for</p>
          </div>
        </div>
        <div className={styles.tabsRow}>
          <button className={`${styles.tabBtn} ${mode === "month" ? styles.active : ""}`} onClick={() => switchMode("month")}>Month</button>
          <button className={`${styles.tabBtn} ${mode === "fy" ? styles.active : ""}`} onClick={() => switchMode("fy")}>Financial Year</button>
        </div>
        <div className={styles.dateFilterRow}>
          {mode === "month" ? (
            <>
              <label className={styles.dateFilterLabel}>
                From
                <Input
                  type="date" aria-label="From date" value={fromDate} max={toDate || todayStr()}
                  onChange={(e) => { setFromDate(e.target.value); setReport(null); }}
                  sz="sm"
                />
              </label>
              <label className={styles.dateFilterLabel}>
                To
                <Input
                  type="date" aria-label="To date" value={toDate} min={fromDate} max={todayStr()}
                  onChange={(e) => { setToDate(e.target.value); setReport(null); }}
                  sz="sm"
                />
              </label>
            </>
          ) : (
            <label className={styles.dateFilterLabel}>
              Financial Year
              <Select
                aria-label="Financial year" value={fyStart}
                onChange={(e) => { setFyStart(Number(e.target.value)); setReport(null); }}
                sz="sm"
              >
                {fyOptions.map((y) => <option key={y} value={y}>{`FY ${y}-${String(y + 1).slice(2)}`}</option>)}
              </Select>
            </label>
          )}
          <Button variant="primary" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate Package"}
          </Button>
        </div>
        {error && <p className={styles.errorText}>{error}</p>}
      </div>

      {report && (
        <>
          {/* Validation status */}
          <div {...animateSection(1, "card")}>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Validation Status</h2>
                <p className="card-header-sub">Checked for {report.period.label}</p>
              </div>
            </div>
            <div className={styles.validationSummary}>
              {report.validation.errorCount === 0 && report.validation.warningCount === 0 ? (
                <div className={`${styles.validationBanner} ${styles.validationOk}`}>No issues found — this period looks ready to file.</div>
              ) : (
                <div className={`${styles.validationBanner} ${report.validation.errorCount > 0 ? styles.validationError : styles.validationWarning}`}>
                  {report.validation.errorCount > 0 && `${report.validation.errorCount} error${report.validation.errorCount !== 1 ? "s" : ""}`}
                  {report.validation.errorCount > 0 && report.validation.warningCount > 0 && " · "}
                  {report.validation.warningCount > 0 && `${report.validation.warningCount} warning${report.validation.warningCount !== 1 ? "s" : ""}`}
                  {" "}found — review before filing.
                </div>
              )}
              {report.validation.issues.length > 0 && (
                <ul className={styles.issueList}>
                  {report.validation.issues.map((issue, i) => (
                    <li key={i} className={issue.severity === "error" ? styles.issueError : styles.issueWarning}>
                      <span className={styles.issueBadge}>{issue.severity === "error" ? "Error" : "Warning"}</span>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Report preview */}
          <div {...animateSection(2, "card")}>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Report Preview</h2>
                <p className="card-header-sub">What will be included in the package</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              {[
                { label: "Sales Invoices", value: String(report.salesRegister.length) },
                { label: "B2B / B2C", value: `${report.b2bSales.length} / ${report.b2cSales.length}` },
                { label: "Credit Notes", value: String(new Set(report.creditNotes.map(c => c.returnId)).size) },
                { label: "Purchase Bills", value: String(report.purchaseRegister.length) },
                { label: "HSN Codes", value: String(report.hsnSummary.length) },
                { label: "Output Tax", value: fmt(report.summary.outputTax) },
                { label: "Input Tax Credit", value: fmt(report.summary.inputTax) },
                { label: "Net GST Payable", value: fmt(report.summary.netGstPayable) },
              ].map(({ label, value }) => (
                <div key={label} className={styles.summaryCard}>
                  <div className={styles.summaryCardLabel}>{label}</div>
                  <div className={styles.summaryCardValue}>{value}</div>
                </div>
              ))}
            </div>
            <div className={styles.downloadRow}>
              <Button variant="primary" onClick={handleDownload} disabled={downloading}>
                {downloading ? "Preparing…" : "Download ZIP"}
              </Button>
            </div>
          </div>
        </>
      )}
      {(generating || downloading) && (
        <OverlayLoader text={generating ? "Generating GST package…" : "Preparing download…"} />
      )}
    </div>
  );
}
