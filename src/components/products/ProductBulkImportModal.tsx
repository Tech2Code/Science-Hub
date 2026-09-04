"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import { useToast } from "@/components/ui/Toast";
import { OverlayLoader } from "@/components/ui/Spinner";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { validateProductForm, hasProductFieldErrors, suggestMinStockForUnit, PRODUCT_GST_RATES, type ProductFieldErrors } from "@/lib/productForm";
import { parsePastedProductText, type ParsedProductRow } from "@/lib/productImport";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import styles from "./ProductBulkImportModal.module.css";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

interface ReviewRow {
  key: string;
  name: string; sku: string; hsn: string; unit: string;
  price: string; purchasePrice: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
  errors: ProductFieldErrors;
  status: "pending" | "saving" | "done" | "error";
  errorMsg?: string;
}

// crypto.randomUUID() stays unique across reloads/restores, unlike a plain counter that could collide with a restored draft's existing keys.
function nextKey(): string {
  return `bulk-import-row-${crypto.randomUUID()}`;
}

function resolveId(name: string, list: { id: string; name: string }[]): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return list.find((x) => x.name.toLowerCase() === trimmed.toLowerCase())?.id ?? "";
}

function toReviewRow(row: ParsedProductRow, brands: Brand[], categories: Category[]): ReviewRow {
  const unit = row.unit || "Nos";
  return {
    key: nextKey(),
    name: row.name, sku: row.sku, hsn: row.hsn, unit,
    price: row.price, purchasePrice: row.purchasePrice, gstRate: row.gstRate || "18",
    stock: row.stock || "0", minStock: row.minStock || String(suggestMinStockForUnit(unit)),
    brandId: resolveId(row.brand, brands), categoryId: resolveId(row.category, categories),
    errors: {}, status: "pending",
  };
}

function validateRow(row: ReviewRow): ProductFieldErrors {
  return validateProductForm({
    name: row.name, sku: row.sku, hsn: row.hsn, description: "", unit: row.unit,
    price: row.price, purchasePrice: row.purchasePrice, gstRate: row.gstRate,
    stock: row.stock, minStock: row.minStock, brandId: row.brandId, categoryId: row.categoryId,
  });
}

const errorBorderStyle = { borderColor: "var(--c-red-border, #fecaca)" } as const;

// A <textarea> placeholder can't distinguish a header line from an example line visually, so the column order is shown as a real numbered legend above it instead.
const PASTE_COLUMN_HEADERS = ["Name", "SKU", "HSN", "Unit", "Price", "Purchase Price", "GST %", "Stock", "Min Stock", "Brand", "Category"];
const PASTE_PLACEHOLDER_EXAMPLE = ["Sodium Nitrate", "SN-001", "28151100", "Kg", "450", "380", "18", "100", "10", "QUALIGENS", "Chemicals"];
const PASTE_PLACEHOLDER = PASTE_PLACEHOLDER_EXAMPLE.join("\t");

// Mirrors MAX_BYTES in src/app/api/products/parse-import/route.ts — checked client-side to reject a huge file instantly instead of after a full upload.
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const DRAFT_KEY = "product-bulk-import";
interface DraftData { step: "input" | "review"; pasteText: string; rows: ReviewRow[]; }

interface ProductBulkImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

// Bulk-import (paste/upload) mirroring RateListItemsTable's flow. Parsed rows go through an editable review table and the same validateProductForm() rules as a manually-typed product before submitting via POST /api/products.
export function ProductBulkImportModal({ open, onClose, onImported }: ProductBulkImportModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<"input" | "review">("input");
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [importing, setImporting] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  // Only for the banner's "N products" wording before the draft is loaded into `rows`; once loaded, rows.length is used directly.
  const [draftRowCount, setDraftRowCount] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDismissDraftOpen, setConfirmDismissDraftOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ items: ParsedProductRow[]; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/brands?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((d) => setBrands(d.data ?? [])).catch(() => {});
    fetch("/api/categories?pageSize=5000", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((d) => setCategories(d.data ?? [])).catch(() => {});
  }, [open]);

  // Checks for a leftover draft on every (re)open (closed tab / refresh mid-review); if rows are already in memory, don't overwrite them with an older snapshot.
  useEffect(() => {
    // Synchronizes with the modal's `open` transition and localStorage (external systems) — a
    // legitimate effect, not state derivable from props/render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) { setDraftReady(false); return; }
    // Every open starts on the input step — unfinished work is only ever resumed via the explicit Resume Draft banner, never silently.
    setStep("input");
    if (rows.length > 0) { setShowDraftBanner(true); setDraftReady(true); return; }
    // Still check localStorage even with in-memory pasteText — an unrelated saved draft could otherwise be silently overwritten.
    const draft = loadFormDraft<DraftData>(DRAFT_KEY);
    if (draft?.values && (draft.values.rows.length > 0 || draft.values.pasteText?.trim())) {
      setDraftRowCount(draft.values.rows.length);
      setShowDraftBanner(true);
    }
    setDraftReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check at the moment `open` flips true, not on every rows/pasteText edit
  }, [open]);

  function restoreDraft() {
    const draft = loadFormDraft<DraftData>(DRAFT_KEY);
    if (draft?.values) {
      setRows(draft.values.rows);
      setPasteText(draft.values.pasteText ?? "");
      // Land on the review table whenever rows exist, even if the draft was saved mid-"Back to input".
      setStep(draft.values.rows.length > 0 ? "review" : draft.values.step);
    }
    setShowDraftBanner(false);
    setDraftReady(true);
  }
  // Confirm-gated since discarding is permanent (localStorage) — a misclick shouldn't wipe a real in-progress import.
  function requestDismissDraft() {
    setConfirmDismissDraftOpen(true);
  }
  function confirmDismissDraft() {
    // reset() clears in-memory rows/pasteText too, not just localStorage, so the review table doesn't look unchanged after discarding.
    reset();
    setShowDraftBanner(false);
    setDraftRowCount(0);
    setConfirmDismissDraftOpen(false);
    toast({ type: "success", title: "Draft discarded", message: "The saved bulk-import draft has been deleted." });
  }

  // "done" rows are kept as-is (handleImportAll skips re-submitting them); only "saving" resets to "pending" since that status can't survive a reload.
  const draftValue: DraftData = {
    step,
    pasteText,
    rows: rows.map((r) => (r.status === "saving" ? { ...r, status: "pending" } : r)),
  };
  useFormDraft(DRAFT_KEY, draftValue, !draftReady || importing || !open);

  function reset() {
    setStep("input");
    setPasteText("");
    setRows([]);
    setImporting(false);
    clearFormDraft(DRAFT_KEY);
  }

  // Closing just hides the popup with no confirm prompt — everything on screen is already autosaved to the draft, reopened via the banner above.
  function handleClose() {
    if (importing) return;
    onClose();
  }

  function goToInputStep() {
    setStep("input");
    // Reuse the same resume-draft banner as the way back to the review table, rather than a second banner with its own dismiss flow.
    if (rows.length > 0) setShowDraftBanner(true);
  }

  function finalizeImport(nextRows: ReviewRow[], skipped: number) {
    setRows(nextRows);
    setStep("review");
    setShowDraftBanner(false);
    if (skipped > 0) {
      toast({ type: "warning", title: "Some rows skipped", message: `${skipped} row${skipped === 1 ? "" : "s"} skipped — missing name or price.` });
    }
  }

  // Appends to what's already in the table rather than replacing it, so re-pasting/uploading after Back doesn't wipe out rows already reviewed.
  function loadRows(parsed: ParsedProductRow[], skipped: number) {
    if (parsed.length === 0) {
      toast({ type: "error", title: "Nothing to import", message: "Couldn't find any usable rows — each needs at least a name and a price." });
      return;
    }
    // A saved draft exists but was ignored (Resume Draft banner) — ask which one the user actually wants before it's silently overwritten.
    if (showDraftBanner && rows.length === 0) {
      setPendingImport({ items: parsed, skipped });
      return;
    }
    const imported = parsed.map((r) => toReviewRow(r, brands, categories));
    finalizeImport([...rows, ...imported], skipped);
  }

  function mergeIntoSavedDraft() {
    if (!pendingImport) return;
    const draft = loadFormDraft<DraftData>(DRAFT_KEY);
    const draftRows = draft?.values?.rows ?? [];
    const imported = pendingImport.items.map((r) => toReviewRow(r, brands, categories));
    finalizeImport([...draftRows, ...imported], pendingImport.skipped);
    setPendingImport(null);
  }

  function startNewImport() {
    if (!pendingImport) return;
    clearFormDraft(DRAFT_KEY);
    const imported = pendingImport.items.map((r) => toReviewRow(r, brands, categories));
    finalizeImport(imported, pendingImport.skipped);
    setPendingImport(null);
  }

  function handlePasteImport() {
    const { items, skipped } = parsePastedProductText(pasteText);
    loadRows(items, skipped);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast({ type: "error", title: "File too large", message: "File is too large (max 5MB)." });
      return;
    }
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/products/parse-import", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ type: "error", title: "Import failed", message: data.error ?? "Could not read the file." });
        return;
      }
      loadRows(data.items as ParsedProductRow[], data.skipped ?? 0);
    } catch {
      toast({ type: "error", title: "Import failed", message: "Network error." });
    }
    setParsing(false);
  }

  function updateRow<K extends keyof ReviewRow>(idx: number, field: K, value: ReviewRow[K]) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value, errors: { ...r.errors, [field]: undefined } } : r)));
  }
  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next);
    // An empty "Review 0 Products" table is a dead end — drop back to the paste/upload screen automatically.
    if (next.length === 0) setStep("input");
  }

  async function handleImportAll() {
    const validated = rows.map((r) => ({ ...r, errors: validateRow(r) }));
    if (validated.some((r) => hasProductFieldErrors(r.errors))) {
      setRows(validated);
      toast({ type: "error", title: "Fix highlighted rows", message: "Some rows have missing or invalid fields." });
      return;
    }

    // Rows submit one at a time, so a large batch can take a few seconds — this toast confirms the click registered while work is queued.
    const toImportCount = validated.filter((r) => r.status !== "done").length;
    if (toImportCount > 0) {
      toast({ type: "info", title: "Importing…", message: `Adding ${toImportCount} product${toImportCount === 1 ? "" : "s"} to your catalog.` });
    }

    setImporting(true);
    const next = [...validated];
    let newlyAdded = 0;
    for (let i = 0; i < next.length; i++) {
      // A "done" row was already created by an earlier attempt/restored draft — re-submitting would just hit a 409, so skip it.
      if (next[i].status === "done") continue;
      next[i] = { ...next[i], status: "saving" };
      setRows([...next]);
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: next[i].name,
            sku: next[i].sku || undefined,
            hsn: next[i].hsn || undefined,
            unit: next[i].unit,
            price: parseFloat(next[i].price),
            purchasePrice: next[i].purchasePrice.trim() ? parseFloat(next[i].purchasePrice) : null,
            gstRate: parseInt(next[i].gstRate),
            stock: parseInt(next[i].stock),
            minStock: parseInt(next[i].minStock),
            brandId: next[i].brandId || undefined,
            categoryId: next[i].categoryId || undefined,
          }),
        });
        if (res.ok) {
          next[i] = { ...next[i], status: "done" };
          newlyAdded++;
        } else {
          const d = await res.json().catch(() => ({}));
          next[i] = { ...next[i], status: "error", errorMsg: d?.error ?? "Failed to save." };
        }
      } catch {
        next[i] = { ...next[i], status: "error", errorMsg: "Network error." };
      }
      setRows([...next]);
    }
    setImporting(false);

    const failCount = next.filter((r) => r.status === "error").length;
    toast({
      type: failCount > 0 ? "warning" : "success",
      title: failCount > 0 ? "Import finished with errors" : "Import complete",
      message: `${newlyAdded} product${newlyAdded === 1 ? "" : "s"} added${failCount > 0 ? `, ${failCount} failed — see rows below.` : "."}`,
    });
    if (newlyAdded > 0) onImported();
    if (failCount === 0) {
      reset();
      onClose();
    }
  }

  return (
    <>
    {parsing && <OverlayLoader text="Reading file…" />}
    {importing && (() => {
      const processed = rows.filter((r) => r.status === "done" || r.status === "error").length;
      return <OverlayLoader text={`Importing products… (${processed}/${rows.length})`} />;
    })()}
    <DiscardDraftConfirm
      open={confirmDismissDraftOpen}
      onConfirm={confirmDismissDraft}
      onCancel={() => setConfirmDismissDraftOpen(false)}
    />
    {pendingImport && (
      <Modal
        open
        onClose={() => setPendingImport(null)}
        title="You have a saved draft"
        variant="center"
      >
        <p>
          You have an unsaved bulk import in progress from earlier. Should these {pendingImport.items.length} new
          product{pendingImport.items.length === 1 ? "" : "s"} be added to that saved draft, or started as a
          separate new import (discarding the saved draft)?
        </p>
        <div className={styles.pendingImportActions}>
          <Button type="button" variant="secondary" size="md" onClick={startNewImport}>Start New (discard draft)</Button>
          <Button type="button" variant="primary" size="md" onClick={mergeIntoSavedDraft}>Add to Saved Draft</Button>
        </div>
      </Modal>
    )}
    <Modal
      open={open}
      onClose={handleClose}
      title={step === "input" ? "Bulk Import Products" : `Review ${rows.length} Product${rows.length === 1 ? "" : "s"}`}
      variant="fullscreen"
      maxWidth={step === "review" ? "min(96vw, 1240px)" : undefined}
      footer={
        step === "input" ? (
          <>
            <Button type="button" variant="secondary" size="md" onClick={handleClose}>Cancel</Button>
            <Button type="button" variant="primary" size="md" onClick={handlePasteImport} disabled={!pasteText.trim() || parsing}>Continue</Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" size="md" onClick={goToInputStep} disabled={importing}>Back</Button>
            <Button type="button" variant="primary" size="md" onClick={handleImportAll} disabled={importing || rows.length === 0}>
              {importing ? "Importing…" : `Import ${rows.length} Product${rows.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      {showDraftBanner && step === "input" && (() => {
        const count = rows.length > 0 ? rows.length : draftRowCount;
        return (
          <div className={styles.draftBannerWrap}>
            <InfoBanner
              message={`You have an unsaved bulk import in progress from earlier — ${count} product${count === 1 ? "" : "s"} waiting. Want to resume it?`}
              actionLabel="Resume draft"
              onAction={restoreDraft}
              onDismiss={requestDismissDraft}
            />
          </div>
        );
      })()}
      {step === "input" ? (
        <div className={styles.pasteForm}>
          <p className={styles.pasteHint}>
            Paste rows copied from Excel, in this column order (or with your own header row naming these columns in any order) — or upload a .xlsx/.csv file. Brand/Category are matched against your existing catalog by name; unmatched ones are left blank for you to assign below.
          </p>
          <ol className={styles.columnLegend}>
            {PASTE_COLUMN_HEADERS.map((h, i) => (
              <li key={h} className={styles.columnLegendItem}>
                <span className={styles.columnLegendIndex}>{i + 1}</span>
                {h}
              </li>
            ))}
          </ol>
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={PASTE_PLACEHOLDER}
            className={styles.pasteTextarea}
          />
          <div className={styles.uploadRow}>
            <span className={styles.uploadSep}>or</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? "Reading file…" : "Upload .xlsx / .csv"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className={styles.hiddenFileInput} onChange={handleFileChange} />
          </div>
        </div>
      ) : (
        <div className={styles.reviewTableWrap}>
          <table className={styles.reviewTable}>
            <colgroup>
              <col className={styles.colIndex} />
              <col className={styles.colName} />
              <col className={styles.colSku} />
              <col className={styles.colHsn} />
              <col className={styles.colUnit} />
              <col className={styles.colPrice} />
              <col className={styles.colPrice} />
              <col className={styles.colGst} />
              <col className={styles.colStock} />
              <col className={styles.colStock} />
              <col className={styles.colBrand} />
              <col className={styles.colCategory} />
              <col className={styles.colAction} />
            </colgroup>
            <thead>
              <tr>
                {["#", "Name", "SKU", "HSN", "Unit", "List Price (₹)", "Purch. Price (₹)", "GST %", "Stock", "Min Stock", "Brand", "Category", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <Fragment key={row.key}>
                  <tr className={row.status === "error" ? styles.rowError : row.status === "done" ? styles.rowDone : row.status === "saving" ? styles.rowSaving : undefined}>
                    <td>{idx + 1}</td>
                    <td><Input sz="sm" value={row.name} onChange={(e) => updateRow(idx, "name", e.target.value)} style={row.errors.name ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td><Input sz="sm" value={row.sku} onChange={(e) => updateRow(idx, "sku", e.target.value)} disabled={importing} /></td>
                    <td><Input sz="sm" value={row.hsn} onChange={(e) => updateRow(idx, "hsn", e.target.value)} disabled={importing} /></td>
                    <td><Input sz="sm" value={row.unit} onChange={(e) => updateRow(idx, "unit", e.target.value)} style={row.errors.unit ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td><Input sz="sm" type="text" inputMode="decimal" value={row.price} onChange={(e) => updateRow(idx, "price", e.target.value.replace(/[^\d.]/g, ""))} style={row.errors.price ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td><Input sz="sm" type="text" inputMode="decimal" value={row.purchasePrice} onChange={(e) => updateRow(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} style={row.errors.purchasePrice ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td>
                      <Select sz="sm" value={row.gstRate} onChange={(e) => updateRow(idx, "gstRate", e.target.value)} disabled={importing}>
                        {PRODUCT_GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
                      </Select>
                    </td>
                    <td><Input sz="sm" type="text" inputMode="numeric" value={row.stock} onChange={(e) => updateRow(idx, "stock", e.target.value.replace(/[^\d]/g, ""))} style={row.errors.stock ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td><Input sz="sm" type="text" inputMode="numeric" value={row.minStock} onChange={(e) => updateRow(idx, "minStock", e.target.value.replace(/[^\d]/g, ""))} style={row.errors.minStock ? errorBorderStyle : undefined} disabled={importing} /></td>
                    <td>
                      <Select sz="sm" value={row.brandId} onChange={(e) => updateRow(idx, "brandId", e.target.value)} disabled={importing}>
                        <option value="">— none —</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </td>
                    <td>
                      <Select sz="sm" value={row.categoryId} onChange={(e) => updateRow(idx, "categoryId", e.target.value)} disabled={importing}>
                        <option value="">— none —</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </td>
                    <td>
                      <button type="button" onClick={() => removeRow(idx)} aria-label="Remove" className={styles.removeRowBtn} disabled={importing}>×</button>
                    </td>
                  </tr>
                  {row.status === "error" && (
                    <tr className={styles.errorDetailRow}>
                      <td colSpan={13} className={styles.errorDetailCell}>
                        ⚠ <strong>{row.name || `Row ${idx + 1}`}</strong>: {row.errorMsg}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
    </>
  );
}
