"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { INDIA_STATES_FULL } from "@/lib/states";
import { useBranding } from "@/lib/businessBranding";
import { animateSection } from "@/lib/animateSection";
import { useScrollToHash } from "@/lib/useScrollToHash";
import { useDirty } from "@/lib/useDirty";
import { clearAllCachedPdfs } from "@/lib/pdfCache";
import { patchCache } from "@/lib/useCache";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { deriveDefaultPrefix, NUMBER_FORMATS, resolveNumberFormat, type NumberFormatId } from "@/lib/documentNumbering";
import styles from "./settings.module.css";

interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string; pan: string;
  gmailUser: string; gmailAppPasswordSet: boolean; gmailAppPasswordDecryptFailed: boolean;
  bankName: string; bankAccountName: string; bankAccountNumber: string; bankIfsc: string; bankBranch: string;
  bankAccountNumberDecryptFailed: boolean;
  termsAndConditions: string;
  logoUrl: string;
  showLogoOnInvoices: boolean;
  invoiceNumberPrefix: string | null;
  nextInvoiceNumberOverride: number | null;
  purchaseBillNumberPrefix: string | null;
  nextPurchaseBillNumberOverride: number | null;
  invoiceNumberFormat: string | null;
  purchaseBillNumberFormat: string | null;
  updatedAt: string;
}

const EMPTY: BusinessSettings = {
  name: "", tagline: "", email: "", phone: "",
  address: "", city: "", state: "", pincode: "", gstin: "", pan: "",
  gmailUser: "", gmailAppPasswordSet: false, gmailAppPasswordDecryptFailed: false,
  bankName: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "",
  bankAccountNumberDecryptFailed: false,
  termsAndConditions: "",
  logoUrl: "",
  showLogoOnInvoices: true,
  invoiceNumberPrefix: null,
  nextInvoiceNumberOverride: null,
  purchaseBillNumberPrefix: null,
  nextPurchaseBillNumberOverride: null,
  invoiceNumberFormat: null,
  purchaseBillNumberFormat: null,
  updatedAt: "",
};

// Bank name/branch are printed on invoices — capitalize each word as typed
// so inconsistent casing ("HDfc", "noida") never reaches a printed invoice.
function toTitleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  const vars = {
    "--sk-w": typeof w === "number" ? `${w}px` : w,
    "--sk-h": `${h}px`,
    "--sk-r": `${r}px`,
  } as React.CSSProperties;
  return <div className={styles.skeleton} style={vars} />;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRowStack}>
      <span className={styles.infoRowLabel}>{label}</span>
      <span
        className={[
          styles.infoRowValue,
          !value ? styles.infoRowValueEmpty : "",
          mono ? styles.infoRowValueMono : "",
        ].filter(Boolean).join(" ")}
      >
        {value || "Not set"}
      </span>
    </div>
  );
}

// Surfaces a NEXTAUTH_SECRET/decrypt mismatch instead of letting a stored
// secret silently look "not configured" — e.g. bank account number blank on
// printed invoices, or Gmail app password missing, for no visible reason.
function DecryptWarning({ what }: { what: string }) {
  return (
    <div className={styles.decryptWarning} role="alert">
      <span>
        ⚠ Stored {what} could not be read back (likely a server configuration issue). Re-enter and save it below to fix.
      </span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={[styles.statusDot, ok ? styles.statusDotOk : ""].filter(Boolean).join(" ")}>
      <span className={[styles.statusDotIndicator, ok ? styles.statusDotIndicatorOk : ""].filter(Boolean).join(" ")} />
      {ok ? "Configured" : "Not configured"}
    </span>
  );
}

function SectionHeader({ title, editing, onEdit }: { title: string; editing: boolean; onEdit: () => void }) {
  return (
    <div className={styles.emailCardHeader}>
      <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{title}</h2>
      {!editing && <Button variant="editOutline" onClick={onEdit}>Edit</Button>}
    </div>
  );
}

type IdentityForm = Pick<BusinessSettings, "name" | "tagline" | "email" | "phone" | "gstin" | "pan">;
type AddressForm = Pick<BusinessSettings, "address" | "city" | "state" | "pincode">;
type BankForm = Pick<BusinessSettings, "bankName" | "bankAccountName" | "bankAccountNumber" | "bankIfsc" | "bankBranch">;
// Kept as plain strings (not string | null / number | null) since these are
// bound directly to text inputs — converted to the API's null/number shape
// only when submitting.
interface NumberingForm {
  invoiceNumberPrefix: string;
  nextInvoiceNumberOverride: string;
  purchaseBillNumberPrefix: string;
  nextPurchaseBillNumberOverride: string;
  invoiceNumberFormat: NumberFormatId;
  purchaseBillNumberFormat: NumberFormatId;
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<BusinessSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { setBranding } = useBranding();
  useScrollToHash(!loading);

  // Each section below has its own independent edit state — editing one
  // does not disturb or require re-submitting the others.

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityForm>({ name: "", tagline: "", email: "", phone: "", gstin: "", pan: "" });
  const identityDirty = useDirty(identityForm);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityErrors, setIdentityErrors] = useState<Partial<Record<keyof IdentityForm, string>>>({});

  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>({ address: "", city: "", state: "", pincode: "" });
  const addressDirty = useDirty(addressForm);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressForm, string>>>({});

  const [editingBank, setEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState<BankForm>({ bankName: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "" });
  const bankDirty = useDirty(bankForm);
  const [savingBank, setSavingBank] = useState(false);
  const [bankErrors, setBankErrors] = useState<Partial<Record<keyof BankForm, string>>>({});
  const [ifscLookup, setIfscLookup] = useState<{ status: "idle" | "loading" | "found" | "error"; label?: string }>({ status: "idle" });
  const ifscRequestRef = useRef<string | null>(null);

  // Email config has its own independent edit state
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ gmailUser: "", gmailAppPassword: "" });
  const emailDirty = useDirty(emailForm);
  const [savingEmail, setSavingEmail] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [emailErrors, setEmailErrors] = useState<{ gmailUser?: string; gmailAppPassword?: string }>({});

  const [editingTerms, setEditingTerms] = useState(false);
  const [termsForm, setTermsForm] = useState("");
  const termsDirty = useDirty(termsForm);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | undefined>(undefined);

  const [editingNumbering, setEditingNumbering] = useState(false);
  const [numberingForm, setNumberingForm] = useState<NumberingForm>({
    invoiceNumberPrefix: "", nextInvoiceNumberOverride: "", purchaseBillNumberPrefix: "", nextPurchaseBillNumberOverride: "",
    invoiceNumberFormat: "seq_fy", purchaseBillNumberFormat: "seq_fy",
  });
  const numberingDirty = useDirty(numberingForm);
  const [savingNumbering, setSavingNumbering] = useState(false);
  const [numberingErrors, setNumberingErrors] = useState<Partial<Record<keyof NumberingForm, string>>>({});
  const [numberingConfirmOpen, setNumberingConfirmOpen] = useState(false);

  const [logoUploading, setLogoUploading] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Branding actions (logo upload/replace/remove, and the "show on invoices"
  // toggle) all save instantly with no form/edit step to absorb the wait, so
  // a full-page overlay (not just a spinner on the affected control) makes it
  // clear the whole page is briefly blocked mid-save. Uses the same shared
  // OverlayLoader as every other async action in the app (e.g. Admin → create user).
  const brandingBusy = savingBranding || logoUploading;

  function applyLoaded(d: Record<string, string | boolean | number | null>) {
    const s: BusinessSettings = {
      name: (d.name as string) ?? "", tagline: (d.tagline as string) ?? "", email: (d.email as string) ?? "",
      phone: (d.phone as string) ?? "", address: (d.address as string) ?? "", city: (d.city as string) ?? "",
      state: (d.state as string) ?? "", pincode: (d.pincode as string) ?? "", gstin: (d.gstin as string) ?? "",
      pan: (d.pan as string) ?? "",
      gmailUser: (d.gmailUser as string) ?? "", gmailAppPasswordSet: Boolean(d.gmailAppPasswordSet),
      gmailAppPasswordDecryptFailed: Boolean(d.gmailAppPasswordDecryptFailed),
      bankName: (d.bankName as string) ?? "", bankAccountName: (d.bankAccountName as string) ?? "",
      bankAccountNumber: (d.bankAccountNumber as string) ?? "", bankIfsc: (d.bankIfsc as string) ?? "",
      bankBranch: (d.bankBranch as string) ?? "",
      bankAccountNumberDecryptFailed: Boolean(d.bankAccountNumberDecryptFailed),
      termsAndConditions: (d.termsAndConditions as string) ?? "",
      logoUrl: (d.logoUrl as string) ?? "",
      showLogoOnInvoices: d.showLogoOnInvoices === undefined ? true : Boolean(d.showLogoOnInvoices),
      invoiceNumberPrefix: (d.invoiceNumberPrefix as string | null) ?? null,
      nextInvoiceNumberOverride: (d.nextInvoiceNumberOverride as number | null) ?? null,
      purchaseBillNumberPrefix: (d.purchaseBillNumberPrefix as string | null) ?? null,
      nextPurchaseBillNumberOverride: (d.nextPurchaseBillNumberOverride as number | null) ?? null,
      invoiceNumberFormat: (d.invoiceNumberFormat as string | null) ?? null,
      purchaseBillNumberFormat: (d.purchaseBillNumberFormat as string | null) ?? null,
      updatedAt: (d.updatedAt as string) ?? "",
    };
    setSaved(s);
    setBranding({ name: s.name, tagline: s.tagline, logoUrl: s.logoUrl });
    return s;
  }

  useEffect(() => {
    fetch("/api/settings", { headers: { "x-no-loader": "1" } })
      .then((r) => r.json())
      .then(applyLoaded)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyLoaded is a fresh function each render (not memoized); this must run once on mount only
  }, []);

  // Sends only the fields the caller is actually editing — never the full
  // `saved` snapshot. Each section (identity/address/bank/email/terms/...)
  // saves independently on the server too (see the settings API route), so
  // a stale or broken value in a section nobody touched (e.g. a bank account
  // number that fails to decrypt because of a NEXTAUTH_SECRET mismatch)
  // can never block or silently overwrite an unrelated save.
  async function putSettings(overrides: Partial<BusinessSettings> & { gmailAppPassword?: string }) {
    const body = { ...overrides, expectedUpdatedAt: saved.updatedAt || undefined };
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json();
      patchCache("/api/settings", () => data);
      await clearAllCachedPdfs();
      return { ok: true as const, data };
    }
    const d = await res.json().catch(() => ({}));
    if (res.status === 409) {
      // Refresh local state so the conflicting fields aren't shown stale, and
      // so the next save attempt compares against the current updatedAt.
      fetch("/api/settings", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then(applyLoaded).catch(() => {});
      return { ok: false as const, error: d.error as string | undefined, conflict: true as const };
    }
    return { ok: false as const, error: d.error as string | undefined, conflict: false as const };
  }

  // ── Business Identity ───────────────────────────────────────────────────

  function handleEditIdentity() {
    // Older saved values may include formatting (dashes/spaces/a country
    // code) from before this field was capped to a plain 10-digit mobile
    // number — keep only the last 10 digits so it displays cleanly in the
    // now-fixed-width PhoneInput instead of showing raw punctuation.
    const initial = { name: saved.name, tagline: saved.tagline, email: saved.email, phone: saved.phone.replace(/\D/g, "").slice(-10), gstin: saved.gstin, pan: saved.pan };
    setIdentityForm(initial);
    identityDirty.markClean(initial);
    setIdentityErrors({});
    setEditingIdentity(true);
  }
  function handleCancelIdentity() { setEditingIdentity(false); setIdentityErrors({}); }

  async function handleSaveIdentity(e: React.FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<keyof IdentityForm, string>> = {
      name:  validate(identityForm.name,  rules.required("Business name cannot be empty.")) ?? undefined,
      email: validate(identityForm.email, rules.email()) ?? undefined,
      phone: validate(identityForm.phone, rules.phone10()) ?? undefined,
      gstin: validate(identityForm.gstin, rules.maxLength(15), rules.gstin()) ?? undefined,
      pan:   validate(identityForm.pan, rules.maxLength(10), rules.pan()) ?? undefined,
    };
    setIdentityErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSavingIdentity(true);
    const result = await putSettings(identityForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingIdentity(false);
      toast({ type: "success", title: "Settings saved", message: "Business identity updated." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingIdentity(false);
  }

  // ── Address ──────────────────────────────────────────────────────────────

  function handleEditAddress() {
    const initial = { address: saved.address, city: saved.city, state: saved.state, pincode: saved.pincode };
    setAddressForm(initial);
    addressDirty.markClean(initial);
    setAddressErrors({});
    setEditingAddress(true);
    addressPincodeLookup.reset();
  }
  function handleCancelAddress() { setEditingAddress(false); setAddressErrors({}); addressPincodeLookup.reset(); }

  const addressPincodeLookup = usePincodeAutofill((city, state) => {
    setAddressForm((f) => ({ ...f, city: city || f.city, state: state || f.state }));
    if (city) setAddressErrors((e) => ({ ...e, city: undefined }));
    if (state) setAddressErrors((e) => ({ ...e, state: undefined }));
  });

  function handleAddressPincodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAddressForm((f) => ({ ...f, pincode: digits }));
    setAddressErrors({});
    if (digits.length === 6) addressPincodeLookup.run(digits);
    else addressPincodeLookup.reset();
  }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    const addressErr = validate(addressForm.address, rules.required("Street address is required."));
    if (addressErr) { setAddressErrors({ address: addressErr }); return; }
    const cityErr = validate(addressForm.city, rules.required("City is required."));
    if (cityErr) { setAddressErrors({ city: cityErr }); return; }
    const stateErr = validate(addressForm.state, rules.required("State is required."));
    if (stateErr) { setAddressErrors({ state: stateErr }); return; }
    const pinErr = validate(addressForm.pincode, rules.required("Pincode is required."), rules.pincode());
    if (pinErr) { setAddressErrors({ pincode: pinErr }); return; }
    setAddressErrors({});
    setSavingAddress(true);
    const result = await putSettings(addressForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingAddress(false);
      toast({ type: "success", title: "Settings saved", message: "Address updated." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingAddress(false);
  }

  // ── Bank Details ────────────────────────────────────────────────────────

  function handleEditBank() {
    const initial = {
      bankName: saved.bankName, bankAccountName: saved.bankAccountName,
      bankAccountNumber: saved.bankAccountNumber, bankIfsc: saved.bankIfsc, bankBranch: saved.bankBranch,
    };
    setBankForm(initial);
    bankDirty.markClean(initial);
    setBankErrors({});
    setIfscLookup({ status: "idle" });
    setEditingBank(true);
  }
  function handleCancelBank() { setEditingBank(false); setBankErrors({}); setIfscLookup({ status: "idle" }); }

  function validateBankIfsc(value: string) {
    const err = validate(value, rules.required("IFSC code is required."), rules.ifsc());
    setBankErrors((e) => ({ ...e, bankIfsc: err ?? undefined }));
    return err;
  }

  function handleBankIfscChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toUpperCase();
    setBankForm((f) => ({ ...f, bankIfsc: value }));
    if (bankErrors.bankIfsc) validateBankIfsc(value);
    setIfscLookup({ status: "idle" });
    // Fire the lookup the instant all 11 characters are in — no need to
    // wait for blur/submit to tell the user whose account this actually is.
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)) runIfscLookup(value);
  }

  // Looks up the bank/branch for a valid IFSC via the server-side proxy and
  // autofills Bank Name/Branch — the user typed 11 chars, we tell them whose
  // account this actually is so a typo'd digit doesn't silently misroute payments.
  // ifscRequestRef guards against a stale response landing after the user has
  // already changed the code again (e.g. pasted, then edited a character).
  async function runIfscLookup(value: string) {
    ifscRequestRef.current = value;
    setBankErrors((e) => ({ ...e, bankIfsc: undefined }));
    setIfscLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/settings/ifsc-lookup/${value}`);
      const data = await res.json();
      if (ifscRequestRef.current !== value) return; // superseded by a newer edit
      if (!res.ok) {
        setIfscLookup({ status: "error", label: data.error ?? "IFSC code not found." });
        setBankErrors((e) => ({ ...e, bankIfsc: data.error ?? "IFSC code not found." }));
        return;
      }
      setIfscLookup({ status: "found", label: `${data.bank}${data.branch ? ` — ${data.branch}` : ""}${data.city ? `, ${data.city}` : ""}` });
      setBankForm((f) => ({
        ...f,
        bankName: data.bank || f.bankName,
        bankBranch: data.branch || f.bankBranch,
      }));
    } catch {
      if (ifscRequestRef.current !== value) return;
      setIfscLookup({ status: "error", label: "Could not verify IFSC right now." });
    }
  }

  function handleBankIfscBlur(value: string) {
    const err = validateBankIfsc(value);
    if (err) { setIfscLookup({ status: "idle" }); return; }
    if (ifscLookup.status === "idle") runIfscLookup(value);
  }

  async function handleSaveBank(e: React.FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<keyof BankForm, string>> = {
      bankName: validate(bankForm.bankName, rules.required("Bank name is required.")) ?? undefined,
      bankAccountNumber: validate(bankForm.bankAccountNumber, rules.required("Account number is required."), rules.accountNumber()) ?? undefined,
      bankIfsc: validate(bankForm.bankIfsc, rules.required("IFSC code is required."), rules.ifsc()) ?? undefined,
      bankBranch: validate(bankForm.bankBranch, rules.required("Branch is required.")) ?? undefined,
    };
    setBankErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSavingBank(true);
    const result = await putSettings(bankForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingBank(false);
      setBankErrors({});
      toast({ type: "success", title: "Settings saved", message: "Bank details updated." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingBank(false);
  }

  // ── Terms & Conditions ──────────────────────────────────────────────────

  function handleEditTerms() {
    setTermsForm(saved.termsAndConditions);
    termsDirty.markClean(saved.termsAndConditions);
    setTermsError(undefined);
    setEditingTerms(true);
  }
  function handleCancelTerms() { setEditingTerms(false); setTermsError(undefined); }

  async function handleSaveTerms(e: React.FormEvent) {
    e.preventDefault();
    const termsErr = validate(termsForm, rules.maxLength(2000));
    if (termsErr) { setTermsError(termsErr); return; }
    setTermsError(undefined);
    setSavingTerms(true);
    const result = await putSettings({ termsAndConditions: termsForm });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingTerms(false);
      toast({ type: "success", title: "Settings saved", message: "Terms & conditions updated." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingTerms(false);
  }

  // ── Document Numbering ──────────────────────────────────────────────────
  // Always editable (no one-time lock) — a changed prefix/number only ever
  // affects the *next* document created, never renumbers existing ones, so
  // repeat edits are safe. The confirm dialog + activity log (server-side)
  // exist purely to stop an accidental change, not to gate a legitimate one.

  function handleEditNumbering() {
    const initial: NumberingForm = {
      invoiceNumberPrefix: saved.invoiceNumberPrefix ?? "",
      nextInvoiceNumberOverride: "",
      purchaseBillNumberPrefix: saved.purchaseBillNumberPrefix ?? "",
      nextPurchaseBillNumberOverride: "",
      invoiceNumberFormat: resolveNumberFormat(saved.invoiceNumberFormat).id,
      purchaseBillNumberFormat: resolveNumberFormat(saved.purchaseBillNumberFormat).id,
    };
    setNumberingForm(initial);
    numberingDirty.markClean(initial);
    setNumberingErrors({});
    setEditingNumbering(true);
  }
  function handleCancelNumbering() { setEditingNumbering(false); setNumberingErrors({}); }

  function handleSubmitNumbering(e: React.FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<keyof NumberingForm, string>> = {
      invoiceNumberPrefix: validate(numberingForm.invoiceNumberPrefix, rules.docPrefix()) ?? undefined,
      purchaseBillNumberPrefix: validate(numberingForm.purchaseBillNumberPrefix, rules.docPrefix()) ?? undefined,
      nextInvoiceNumberOverride: validate(numberingForm.nextInvoiceNumberOverride, rules.positiveInteger()) ?? undefined,
      nextPurchaseBillNumberOverride: validate(numberingForm.nextPurchaseBillNumberOverride, rules.positiveInteger()) ?? undefined,
    };
    setNumberingErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setNumberingConfirmOpen(true);
  }

  async function handleConfirmNumbering() {
    setSavingNumbering(true);
    const result = await putSettings({
      invoiceNumberPrefix: numberingForm.invoiceNumberPrefix.trim().toUpperCase() || null,
      nextInvoiceNumberOverride: numberingForm.nextInvoiceNumberOverride.trim() ? parseInt(numberingForm.nextInvoiceNumberOverride, 10) : null,
      purchaseBillNumberPrefix: numberingForm.purchaseBillNumberPrefix.trim().toUpperCase() || null,
      nextPurchaseBillNumberOverride: numberingForm.nextPurchaseBillNumberOverride.trim() ? parseInt(numberingForm.nextPurchaseBillNumberOverride, 10) : null,
      invoiceNumberFormat: numberingForm.invoiceNumberFormat,
      purchaseBillNumberFormat: numberingForm.purchaseBillNumberFormat,
    });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingNumbering(false);
      setNumberingConfirmOpen(false);
      toast({ type: "success", title: "Settings saved", message: "Document numbering updated. This only affects the next invoice/purchase bill created." });
    } else if (result.conflict) {
      setNumberingConfirmOpen(false);
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      setNumberingConfirmOpen(false);
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save numbering settings." });
    }
    setSavingNumbering(false);
  }

  // ── Logo ─────────────────────────────────────────────────────────────────

  // The logo is rendered at ~40x36px in the sidebar/topbar on every dashboard
  // page navigation — uploading it at full camera/screenshot resolution (up
  // to the 2MB cap) means every page load decodes and downscales a full-size
  // image in the browser. Downscale to a small max dimension client-side
  // before upload so what's stored (and re-fetched on every nav) is already
  // sidebar-sized, with some headroom for retina displays.
  const LOGO_MAX_DIMENSION = 256;
  function downscaleImage(file: File, maxDim: number): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(file); return; } // already small enough
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const outType = file.type === "image/png" ? "image/png" : "image/webp";
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: outType }));
        }, outType, 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setLogoUploading(true);
    try {
      const file = await downscaleImage(rawFile, LOGO_MAX_DIMENSION);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ type: "error", title: "Upload failed", message: data.error ?? "Could not upload logo." });
        return;
      }
      const oldUrl = saved.logoUrl;
      const result = await putSettings({ logoUrl: data.url });
      if (result.ok) {
        applyLoaded(result.data);
        toast({ type: "success", title: "Logo updated", message: "Your business logo has been updated." });
        if (oldUrl) {
          fetch("/api/settings/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: oldUrl }) }).catch(() => {});
        }
      } else {
        // Save failed — remove the blob we just uploaded so it doesn't orphan.
        fetch("/api/settings/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url }) }).catch(() => {});
        if (result.conflict) {
          toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
        } else {
          toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save logo." });
        }
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Could not upload logo." });
    }
    setLogoUploading(false);
    e.target.value = "";
  }

  async function handleRemoveLogo() {
    const oldUrl = saved.logoUrl;
    if (!oldUrl) return;
    setLogoUploading(true);
    const result = await putSettings({ logoUrl: "" });
    if (result.ok) {
      applyLoaded(result.data);
      toast({ type: "success", title: "Logo removed", message: "Reverted to the default logo." });
      fetch("/api/settings/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: oldUrl }) }).catch(() => {});
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Failed", message: result.error ?? "Could not remove logo." });
    }
    setLogoUploading(false);
  }

  async function handleToggleInvoiceLogo() {
    const next = !saved.showLogoOnInvoices;
    setSavingBranding(true);
    const result = await putSettings({ showLogoOnInvoices: next });
    if (result.ok) {
      applyLoaded(result.data);
      toast({
        type: "success",
        title: "Invoice logo setting saved",
        message: next ? "Logo will show on invoices." : "Logo will be hidden on invoices.",
      });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save invoice logo setting." });
    }
    setSavingBranding(false);
  }

  // ── Email config ──────────────────────────────────────────────────────────

  function handleEditEmail() {
    const initial = { gmailUser: saved.gmailUser, gmailAppPassword: "" };
    setEmailForm(initial);
    emailDirty.markClean(initial);
    setConfirmClear(false);
    setEmailErrors({});
    setEditingEmail(true);
  }

  function handleCancelEmail() {
    setEmailForm({ gmailUser: "", gmailAppPassword: "" });
    setConfirmClear(false);
    setEmailErrors({});
    setEditingEmail(false);
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    const gmailErr = validate(emailForm.gmailUser, rules.required("Enter a Gmail address."), rules.email("Enter a valid Gmail address."));
    const pwErr = !saved.gmailAppPasswordSet && !emailForm.gmailAppPassword ? "No existing password — enter one to enable email." : undefined;
    if (gmailErr || pwErr) { setEmailErrors({ gmailUser: gmailErr ?? undefined, gmailAppPassword: pwErr }); return; }
    setEmailErrors({});
    setSavingEmail(true);
    const result = await putSettings({
      gmailUser: emailForm.gmailUser.trim(),
      ...(emailForm.gmailAppPassword ? { gmailAppPassword: emailForm.gmailAppPassword } : {}),
    });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingEmail(false);
      toast({ type: "success", title: "Email configured", message: "Gmail credentials saved successfully." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save email settings." });
    }
    setSavingEmail(false);
  }

  async function handleClearEmail() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setSavingEmail(true);
    const result = await putSettings({ gmailUser: "", gmailAppPassword: "" });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingEmail(false);
      setConfirmClear(false);
      toast({ type: "success", title: "Credentials cleared", message: "Email configuration has been removed." });
    } else if (result.conflict) {
      toast({ type: "error", title: "Update conflict", message: result.error ?? "Business settings were changed by someone else. Please reload and try again." });
    } else {
      toast({ type: "error", title: "Failed", message: result.error ?? "Could not clear credentials." });
    }
    setSavingEmail(false);
  }

  const address = [saved.address, saved.city, saved.state, saved.pincode].filter(Boolean).join(", ");
  const emailConfigured = !!(saved.gmailUser && saved.gmailAppPasswordSet);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Settings</h1>
          <p className="page-sub">Details that appear on every invoice and outgoing email.</p>
        </div>
      </div>

      {/* ── Skeleton ─────────────────────────────────────────────────── */}
      {loading ? (
        <>
          <div {...animateSection(0, `card ${styles.cardPad} ${styles.skeletonCardBody}`)}>
            <Sk w={100} h={13} />
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Sk w={64} h={64} r={12} />
              <div style={{ display: "flex", gap: 8 }}>
                <Sk w={110} h={36} r={8} />
                <Sk w={80} h={36} r={8} />
              </div>
            </div>
          </div>
          {[5, 4].map((count, ci) => (
            <div key={ci} {...animateSection(ci + 1, `card ${styles.cardPad} ${styles.skeletonCardBody}`)}>
              <Sk w={ci === 0 ? 140 : 100} h={13} />
              <div className={styles.skeletonGrid}>
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className={styles.skeletonFieldStack}>
                    <Sk w={70} h={10} />
                    <Sk w="80%" h={15} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div {...animateSection(3, `card ${styles.cardPad} ${styles.skeletonCardBody}`)}>
            <Sk w={160} h={13} />
            <Sk w="50%" h={15} />
          </div>
        </>

      ) : (
        <>
          {/* ── Branding (Logo) ──────────────────────────────────────────── */}
          <div id="branding" {...animateSection(0, `card ${styles.cardPad}`)}>
            <h2 className={styles.sectionTitle}>Branding</h2>
            <p className={styles.stateHint}>Shown on the sidebar, login screen, and invoices when enabled.</p>
            <div className={styles.emailFormGrid} style={{ alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className={styles.logoPreview}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded blob URL, not a static asset */}
                  <img src={saved.logoUrl || "/logo.png"} alt="Business logo" className={styles.logoPreviewImg} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLogoChange}
                    style={{ display: "none" }}
                  />
                  <Button type="button" variant="editOutline" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
                    {logoUploading ? "Uploading…" : saved.logoUrl ? "Replace Logo" : "Upload Logo"}
                  </Button>
                  {saved.logoUrl && (
                    <Button type="button" variant="danger" disabled={logoUploading} onClick={handleRemoveLogo}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className={styles.invoiceLogoToggleRow}>
                <div>
                  <div className={styles.invoiceLogoToggleTitle}>Show logo on invoices</div>
                  <div className={styles.invoiceLogoToggleHint}>
                    {saved.showLogoOnInvoices ? "Invoice PDFs and print views include the business logo." : "Invoice PDFs and print views hide the business logo."}
                  </div>
                </div>
                <Switch
                  checked={saved.showLogoOnInvoices}
                  onChange={handleToggleInvoiceLogo}
                  disabled={savingBranding}
                  aria-label="Show logo on invoices"
                />
              </div>
            </div>
          </div>

          {/* ── Business Identity ─────────────────────────────────────── */}
          <div id="identity" {...animateSection(1, `card ${styles.cardPad}`)}>
            <SectionHeader title="Business Identity" editing={editingIdentity} onEdit={handleEditIdentity} />
            {!editingIdentity ? (
              <div className={styles.infoGrid}>
                <InfoRow label="Business Name" value={saved.name} />
                <InfoRow label="Tagline" value={saved.tagline} />
                <InfoRow label="Business Email (on invoices)" value={saved.email} />
                <InfoRow label="Phone" value={saved.phone} />
                <InfoRow label="GSTIN" value={saved.gstin} mono />
                <InfoRow label="PAN" value={saved.pan} mono />
              </div>
            ) : (
              <form onSubmit={handleSaveIdentity} noValidate>
                <div className={styles.formGrid}>
                  <FormField label="Business Name" required error={identityErrors.name}>
                    <Input value={identityForm.name} onChange={(e) => { setIdentityForm((f) => ({ ...f, name: e.target.value })); setIdentityErrors((p) => ({ ...p, name: undefined })); }} placeholder="e.g. Science Hub" />
                  </FormField>
                  <FormField label="Tagline">
                    <Input value={identityForm.tagline} onChange={(e) => setIdentityForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Industrial & Laboratory Solutions" />
                  </FormField>
                  <FormField label="Business Email (on invoices)" error={identityErrors.email}>
                    <Input type="email" value={identityForm.email} onChange={(e) => { setIdentityForm((f) => ({ ...f, email: e.target.value })); setIdentityErrors((p) => ({ ...p, email: undefined })); }} placeholder="e.g. info@sciencehub.com" />
                  </FormField>
                  <FormField label="Phone" error={identityErrors.phone}>
                    <PhoneInput value={identityForm.phone} onChange={(e) => { setIdentityForm((f) => ({ ...f, phone: e.target.value })); setIdentityErrors((p) => ({ ...p, phone: undefined })); }} placeholder="10-digit mobile" />
                  </FormField>
                  <FormField label="GSTIN" error={identityErrors.gstin}>
                    <Input value={identityForm.gstin} onChange={(e) => { setIdentityForm((f) => ({ ...f, gstin: e.target.value })); setIdentityErrors((p) => ({ ...p, gstin: undefined })); }} placeholder="e.g. 07AAAAA0000A1Z5" className={styles.gstinInput} maxLength={15} />
                  </FormField>
                  <FormField label="PAN" error={identityErrors.pan}>
                    <Input value={identityForm.pan} onChange={(e) => { setIdentityForm((f) => ({ ...f, pan: e.target.value.toUpperCase() })); setIdentityErrors((p) => ({ ...p, pan: undefined })); }} placeholder="e.g. AAAAA0000A" className={styles.gstinInput} maxLength={10} />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingIdentity} onClick={handleCancelIdentity}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingIdentity || !identityDirty.isDirty || !identityForm.name.trim()}>{savingIdentity ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Address ────────────────────────────────────────────────── */}
          <div id="address" {...animateSection(2, `card ${styles.cardPad}`)}>
            <SectionHeader title="Address" editing={editingAddress} onEdit={handleEditAddress} />
            {!editingAddress ? (
              <>
                <div className={styles.infoGrid}>
                  <InfoRow label="Street Address" value={saved.address} />
                  <InfoRow label="City" value={saved.city} />
                  <InfoRow label="State" value={saved.state} />
                  <InfoRow label="Pincode" value={saved.pincode} />
                </div>
                {address && (
                  <div className={styles.fullAddressBlock}>
                    <span className={styles.infoRowLabel}>Full Address</span>
                    <p className={styles.fullAddressText}>{address}</p>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleSaveAddress} noValidate>
                <p className={styles.stateHint}>
                  The <strong>State</strong> field determines intra-state (CGST+SGST) vs inter-state (IGST) for new invoices.
                </p>
                <div className={styles.formGrid}>
                  <FormField label="Street Address" required error={addressErrors.address}>
                    <Input value={addressForm.address} onChange={(e) => { setAddressForm((f) => ({ ...f, address: e.target.value })); setAddressErrors((er) => ({ ...er, address: undefined })); }} placeholder="e.g. Pooth Khurd" />
                  </FormField>
                  <FormField
                    label="Pincode"
                    required
                    error={addressErrors.pincode}
                    hint={addressPincodeLookup.status.status === "loading" ? "Looking up city/state…" : addressPincodeLookup.status.label}
                    hintSuccess={addressPincodeLookup.status.status === "found"}
                  >
                    <Input value={addressForm.pincode} onChange={handleAddressPincodeChange} placeholder="e.g. 110039" maxLength={6} />
                  </FormField>
                  <FormField label="City" required error={addressErrors.city}>
                    <Input value={addressForm.city} onChange={(e) => { setAddressForm((f) => ({ ...f, city: e.target.value })); setAddressErrors((er) => ({ ...er, city: undefined })); }} placeholder="e.g. Delhi" />
                  </FormField>
                  <FormField label="State" required error={addressErrors.state}>
                    <Select value={addressForm.state} onChange={(e) => { setAddressForm((f) => ({ ...f, state: e.target.value })); setAddressErrors((er) => ({ ...er, state: undefined })); }}>
                      <option value="">Select state</option>
                      {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingAddress} onClick={handleCancelAddress}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingAddress || !addressDirty.isDirty}>{savingAddress ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Bank Details ───────────────────────────────────────────── */}
          <div id="bank-details" {...animateSection(3, `card ${styles.cardPad}`)}>
            <SectionHeader title="Bank Details" editing={editingBank} onEdit={handleEditBank} />
            {saved.bankAccountNumberDecryptFailed && <DecryptWarning what="bank account number" />}
            {!editingBank ? (
              <>
                <p className={styles.stateHint}>Printed on every invoice so customers can pay by bank transfer.</p>
                <div className={styles.infoGrid}>
                  <InfoRow label="Bank Name" value={saved.bankName} />
                  <InfoRow label="Account Holder Name" value={saved.bankAccountName} />
                  <InfoRow label="Account Number" value={saved.bankAccountNumber} mono />
                  <InfoRow label="IFSC Code" value={saved.bankIfsc} mono />
                  <InfoRow label="Branch" value={saved.bankBranch} />
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveBank} noValidate>
                <p className={styles.stateHint}>
                  Printed on every invoice so customers can pay by bank transfer. Only admins can edit these.
                </p>
                <div className={styles.formGrid}>
                  <FormField label="Bank Name" required error={bankErrors.bankName}>
                    <Input value={bankForm.bankName} onChange={(e) => { setBankForm((f) => ({ ...f, bankName: toTitleCase(e.target.value) })); setBankErrors((p) => ({ ...p, bankName: undefined })); }} placeholder="e.g. HDFC Bank" />
                  </FormField>
                  <FormField label="Account Holder Name">
                    <Input value={bankForm.bankAccountName} onChange={(e) => setBankForm((f) => ({ ...f, bankAccountName: e.target.value }))} placeholder="e.g. Science Hub" />
                  </FormField>
                  <FormField label="Account Number" required error={bankErrors.bankAccountNumber}>
                    <Input value={bankForm.bankAccountNumber} onChange={(e) => { setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })); setBankErrors((p) => ({ ...p, bankAccountNumber: undefined })); }} placeholder="e.g. 123456789012" className={styles.gstinInput} maxLength={18} />
                  </FormField>
                  <FormField
                    label="IFSC Code"
                    required
                    error={bankErrors.bankIfsc}
                    hint={
                      ifscLookup.status === "loading" ? "Checking IFSC…" :
                      ifscLookup.status === "found" && !bankErrors.bankIfsc ? `✓ ${ifscLookup.label}` :
                      undefined
                    }
                    hintSuccess={ifscLookup.status === "found" && !bankErrors.bankIfsc}
                  >
                    <Input
                      value={bankForm.bankIfsc}
                      onChange={handleBankIfscChange}
                      onBlur={(e) => handleBankIfscBlur(e.target.value)}
                      placeholder="e.g. HDFC0001234"
                      className={styles.gstinInput}
                      maxLength={11}
                    />
                  </FormField>
                  <FormField label="Branch" required error={bankErrors.bankBranch}>
                    <Input value={bankForm.bankBranch} onChange={(e) => { setBankForm((f) => ({ ...f, bankBranch: toTitleCase(e.target.value) })); setBankErrors((p) => ({ ...p, bankBranch: undefined })); }} placeholder="e.g. Noida" />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingBank} onClick={handleCancelBank}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingBank || !bankDirty.isDirty || !bankForm.bankName.trim() || !bankForm.bankAccountNumber.trim() || !bankForm.bankIfsc.trim() || !bankForm.bankBranch.trim()}>{savingBank ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Terms & Conditions ────────────────────────────────────────── */}
          <div id="terms" {...animateSection(4, `card ${styles.cardPad}`)}>
            <SectionHeader title="Terms & Conditions" editing={editingTerms} onEdit={handleEditTerms} />
            {!editingTerms ? (
              <>
                <p className={styles.stateHint}>Printed on every invoice, below the item table. One line per point.</p>
                {saved.termsAndConditions.trim() ? (
                  <ol className={styles.termsPreviewList}>
                    {saved.termsAndConditions.split("\n").map((line, i) => line.trim() && <li key={i}>{line.trim()}</li>)}
                  </ol>
                ) : (
                  <p className={styles.stateHint}>No terms configured — nothing will be printed on invoices.</p>
                )}
              </>
            ) : (
              <form onSubmit={handleSaveTerms} noValidate>
                <p className={styles.stateHint}>One point per line — each line becomes a numbered item on the invoice.</p>
                <FormField label="Terms & Conditions" error={termsError}>
                  <Textarea
                    value={termsForm}
                    onChange={(e) => { setTermsForm(e.target.value); setTermsError(undefined); }}
                    rows={6}
                    placeholder={"e.g. Interest @ 24%p.a would be charged after 45 days of Invoice\nMaterial sold strictly for lab use only"}
                  />
                </FormField>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingTerms} onClick={handleCancelTerms}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingTerms || !termsDirty.isDirty}>{savingTerms ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Email Configuration card (always visible, own edit state) ── */}
          <div id="email" {...animateSection(5, `card ${styles.cardPad}`)}>
            <div className={styles.emailCardHeader}>
              <div>
                <h2 className={styles.emailCardTitle}>
                  Gmail — for sending invoice PDFs via email
                </h2>
                <p className={styles.emailCardHint}>
                  Not your login email. This Gmail account is only used to send invoices.
                </p>
                <StatusDot ok={emailConfigured} />
              </div>
              {!editingEmail && (
                <Button variant="editOutline" onClick={handleEditEmail}>
                  {emailConfigured ? "Update Credentials" : "Set Up Email"}
                </Button>
              )}
            </div>
            {saved.gmailAppPasswordDecryptFailed && <DecryptWarning what="Gmail app password" />}

            {!editingEmail ? (
              /* View sub-mode */
              emailConfigured ? (
                <div className={styles.infoGrid}>
                  <InfoRow label="Gmail (send-from address — not your login)" value={saved.gmailUser} />
                  <InfoRow label="App Password" value="••••••••••••••••" />
                </div>
              ) : (
                <div className={styles.emptyEmailBox}>
                  <p className={styles.emptyEmailTitle}>
                    No email credentials set.
                  </p>
                  <p className={styles.emptyEmailSub}>
                    Invoices cannot be emailed until a Gmail address and App Password are configured.
                  </p>
                </div>
              )
            ) : (
              /* Inline edit sub-mode */
              <form onSubmit={handleSaveEmail} noValidate>
                <div className={styles.appPasswordHintBox}>
                  <p className={styles.appPasswordHintText}>
                    Use a Gmail address with{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.inlineLink}
                    >
                      2-Step Verification enabled
                    </a>
                    . Generate an App Password at{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.inlineLink}
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    {" "}— select Mail and copy the 16-character code.
                  </p>
                </div>

                <div className={styles.emailFormGrid}>
                  <FormField label="Gmail Address (send-from — not your login email)" error={emailErrors.gmailUser}>
                    <Input
                      type="email"
                      value={emailForm.gmailUser}
                      onChange={(e) => { setEmailForm((f) => ({ ...f, gmailUser: e.target.value })); setEmailErrors((p) => ({ ...p, gmailUser: undefined })); }}
                      placeholder="yourbusiness@gmail.com"
                    />
                  </FormField>
                  <FormField label={saved.gmailAppPasswordSet ? "New App Password (leave blank to keep current)" : "App Password"} error={emailErrors.gmailAppPassword}>
                    <Input
                      type="password"
                      value={emailForm.gmailAppPassword}
                      onChange={(e) => { setEmailForm((f) => ({ ...f, gmailAppPassword: e.target.value })); setEmailErrors((p) => ({ ...p, gmailAppPassword: undefined })); }}
                      placeholder={saved.gmailAppPasswordSet ? "Leave blank to keep existing" : "16-character App Password"}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>

                <div className={styles.emailFormActions}>
                  {/* Clear / danger side */}
                  {emailConfigured && (
                    <div className={styles.clearGroup}>
                      {confirmClear ? (
                        <>
                          <span className={styles.clearConfirmText}>
                            Remove all credentials?
                          </span>
                          <Button type="button" variant="danger" disabled={savingEmail} onClick={handleClearEmail}>
                            {savingEmail ? "Clearing…" : "Yes, Clear"}
                          </Button>
                          <Button type="button" variant="secondary" disabled={savingEmail} onClick={() => setConfirmClear(false)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="danger" disabled={savingEmail} onClick={handleClearEmail}>
                          Clear Credentials
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Save / cancel side */}
                  <div className={styles.saveCancelGroup}>
                    <Button type="button" variant="secondary" disabled={savingEmail} onClick={handleCancelEmail}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={savingEmail || !emailDirty.isDirty || !emailForm.gmailUser.trim()}>
                      {savingEmail ? "Saving…" : "Save Credentials"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* ── Document Numbering ────────────────────────────────────────── */}
          <div id="numbering" {...animateSection(6, `card ${styles.cardPad}`)}>
            <SectionHeader title="Document Numbering" editing={editingNumbering} onEdit={handleEditNumbering} />
            {!editingNumbering ? (
              <>
                <p className={styles.stateHint}>
                  Changing these only affects the <strong>next</strong> invoice/purchase bill created — existing documents keep their numbers.
                </p>
                <div className={styles.infoGrid}>
                  <InfoRow
                    label="Invoice Number Format"
                    value={`${resolveNumberFormat(saved.invoiceNumberFormat).label} — e.g. ${resolveNumberFormat(saved.invoiceNumberFormat).example(saved.invoiceNumberPrefix ?? deriveDefaultPrefix(saved.name))}`}
                  />
                  <InfoRow
                    label="Invoice Prefix"
                    value={saved.invoiceNumberPrefix ?? `${deriveDefaultPrefix(saved.name)} (auto, from business name)`}
                    mono
                  />
                  <InfoRow
                    label="Next Invoice Number"
                    value={saved.nextInvoiceNumberOverride ? String(saved.nextInvoiceNumberOverride) : "Continues automatically"}
                  />
                  <InfoRow
                    label="Purchase Bill Number Format"
                    value={`${resolveNumberFormat(saved.purchaseBillNumberFormat).label} — e.g. ${resolveNumberFormat(saved.purchaseBillNumberFormat).example(saved.purchaseBillNumberPrefix ?? "PB")}`}
                  />
                  <InfoRow
                    label="Purchase Bill Prefix"
                    value={saved.purchaseBillNumberPrefix ?? "PB (default)"}
                    mono
                  />
                  <InfoRow
                    label="Next Purchase Bill Number"
                    value={saved.nextPurchaseBillNumberOverride ? String(saved.nextPurchaseBillNumberOverride) : "Continues automatically"}
                  />
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmitNumbering} noValidate>
                <p className={styles.stateHint}>
                  Leave a prefix/number field blank to keep the default. A &ldquo;next number&rdquo; only applies once, then clears itself.
                </p>
                <div className={styles.formGrid}>
                  <FormField label="Invoice Number Format" hint={`Preview: ${NUMBER_FORMATS[numberingForm.invoiceNumberFormat].example(numberingForm.invoiceNumberPrefix.trim().toUpperCase() || deriveDefaultPrefix(saved.name))}`}>
                    <Select
                      value={numberingForm.invoiceNumberFormat}
                      onChange={(e) => setNumberingForm((f) => ({ ...f, invoiceNumberFormat: e.target.value as NumberFormatId }))}
                    >
                      {Object.values(NUMBER_FORMATS).map((fmt) => <option key={fmt.id} value={fmt.id}>{fmt.label}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Invoice Prefix" error={numberingErrors.invoiceNumberPrefix} hint={`Default: ${deriveDefaultPrefix(saved.name)}`}>
                    <Input
                      value={numberingForm.invoiceNumberPrefix}
                      onChange={(e) => { setNumberingForm((f) => ({ ...f, invoiceNumberPrefix: e.target.value.toUpperCase() })); setNumberingErrors((p) => ({ ...p, invoiceNumberPrefix: undefined })); }}
                      placeholder={deriveDefaultPrefix(saved.name)}
                      maxLength={6}
                      className={styles.gstinInput}
                    />
                  </FormField>
                  <FormField label="Next Invoice Number (one-time)" error={numberingErrors.nextInvoiceNumberOverride}>
                    <Input
                      type="number"
                      min={1}
                      value={numberingForm.nextInvoiceNumberOverride}
                      onChange={(e) => { setNumberingForm((f) => ({ ...f, nextInvoiceNumberOverride: e.target.value })); setNumberingErrors((p) => ({ ...p, nextInvoiceNumberOverride: undefined })); }}
                      placeholder="e.g. 19"
                    />
                  </FormField>
                  <FormField label="Purchase Bill Number Format" hint={`Preview: ${NUMBER_FORMATS[numberingForm.purchaseBillNumberFormat].example(numberingForm.purchaseBillNumberPrefix.trim().toUpperCase() || "PB")}`}>
                    <Select
                      value={numberingForm.purchaseBillNumberFormat}
                      onChange={(e) => setNumberingForm((f) => ({ ...f, purchaseBillNumberFormat: e.target.value as NumberFormatId }))}
                    >
                      {Object.values(NUMBER_FORMATS).map((fmt) => <option key={fmt.id} value={fmt.id}>{fmt.label}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Purchase Bill Prefix" error={numberingErrors.purchaseBillNumberPrefix} hint="Default: PB">
                    <Input
                      value={numberingForm.purchaseBillNumberPrefix}
                      onChange={(e) => { setNumberingForm((f) => ({ ...f, purchaseBillNumberPrefix: e.target.value.toUpperCase() })); setNumberingErrors((p) => ({ ...p, purchaseBillNumberPrefix: undefined })); }}
                      placeholder="PB"
                      maxLength={6}
                      className={styles.gstinInput}
                    />
                  </FormField>
                  <FormField label="Next Purchase Bill Number (one-time)" error={numberingErrors.nextPurchaseBillNumberOverride}>
                    <Input
                      type="number"
                      min={1}
                      value={numberingForm.nextPurchaseBillNumberOverride}
                      onChange={(e) => { setNumberingForm((f) => ({ ...f, nextPurchaseBillNumberOverride: e.target.value })); setNumberingErrors((p) => ({ ...p, nextPurchaseBillNumberOverride: undefined })); }}
                      placeholder="e.g. 19"
                    />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingNumbering} onClick={handleCancelNumbering}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingNumbering || !numberingDirty.isDirty}>{savingNumbering ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
      {brandingBusy && <OverlayLoader text={logoUploading ? "Updating logo…" : "Updating invoice logo setting…"} />}
      <ConfirmDialog
        open={numberingConfirmOpen}
        title="Update document numbering?"
        message="This changes numbering for the next invoice/purchase bill created. Existing documents keep their current numbers."
        detail={
          <ul className={styles.termsPreviewList}>
            <li>Invoice format: <strong>{NUMBER_FORMATS[numberingForm.invoiceNumberFormat].example(numberingForm.invoiceNumberPrefix.trim().toUpperCase() || deriveDefaultPrefix(saved.name))}</strong></li>
            {numberingForm.nextInvoiceNumberOverride.trim() && <li>Next invoice number: <strong>{numberingForm.nextInvoiceNumberOverride}</strong></li>}
            <li>Purchase bill format: <strong>{NUMBER_FORMATS[numberingForm.purchaseBillNumberFormat].example(numberingForm.purchaseBillNumberPrefix.trim().toUpperCase() || "PB")}</strong></li>
            {numberingForm.nextPurchaseBillNumberOverride.trim() && <li>Next purchase bill number: <strong>{numberingForm.nextPurchaseBillNumberOverride}</strong></li>}
          </ul>
        }
        confirmLabel={savingNumbering ? "Saving…" : "Confirm"}
        loading={savingNumbering}
        onConfirm={handleConfirmNumbering}
        onCancel={() => setNumberingConfirmOpen(false)}
      />
    </div>
  );
}
