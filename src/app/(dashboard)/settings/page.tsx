"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { useBranding } from "@/lib/businessBranding";
import { animateSection } from "@/lib/animateSection";
import styles from "./settings.module.css";

interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string; pan: string;
  gmailUser: string; gmailAppPasswordSet: boolean;
  bankName: string; bankAccountName: string; bankAccountNumber: string; bankIfsc: string; bankBranch: string;
  termsAndConditions: string;
  logoUrl: string;
}

const EMPTY: BusinessSettings = {
  name: "", tagline: "", email: "", phone: "",
  address: "", city: "", state: "", pincode: "", gstin: "", pan: "",
  gmailUser: "", gmailAppPasswordSet: false,
  bankName: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "",
  termsAndConditions: "",
  logoUrl: "",
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

export default function SettingsPage() {
  const [saved, setSaved] = useState<BusinessSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { setBranding } = useBranding();

  // Each section below has its own independent edit state — editing one
  // does not disturb or require re-submitting the others.

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityForm>({ name: "", tagline: "", email: "", phone: "", gstin: "", pan: "" });
  const [savingIdentity, setSavingIdentity] = useState(false);

  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>({ address: "", city: "", state: "", pincode: "" });
  const [savingAddress, setSavingAddress] = useState(false);

  const [editingBank, setEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState<BankForm>({ bankName: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "" });
  const [savingBank, setSavingBank] = useState(false);
  const [bankErrors, setBankErrors] = useState<Partial<Record<keyof BankForm, string>>>({});
  const [ifscLookup, setIfscLookup] = useState<{ status: "idle" | "loading" | "found" | "error"; label?: string }>({ status: "idle" });
  const ifscRequestRef = useRef<string | null>(null);

  // Email config has its own independent edit state
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ gmailUser: "", gmailAppPassword: "" });
  const [savingEmail, setSavingEmail] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [editingTerms, setEditingTerms] = useState(false);
  const [termsForm, setTermsForm] = useState("");
  const [savingTerms, setSavingTerms] = useState(false);

  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function applyLoaded(d: Record<string, string | boolean>) {
    const s: BusinessSettings = {
      name: (d.name as string) ?? "", tagline: (d.tagline as string) ?? "", email: (d.email as string) ?? "",
      phone: (d.phone as string) ?? "", address: (d.address as string) ?? "", city: (d.city as string) ?? "",
      state: (d.state as string) ?? "", pincode: (d.pincode as string) ?? "", gstin: (d.gstin as string) ?? "",
      pan: (d.pan as string) ?? "",
      gmailUser: (d.gmailUser as string) ?? "", gmailAppPasswordSet: Boolean(d.gmailAppPasswordSet),
      bankName: (d.bankName as string) ?? "", bankAccountName: (d.bankAccountName as string) ?? "",
      bankAccountNumber: (d.bankAccountNumber as string) ?? "", bankIfsc: (d.bankIfsc as string) ?? "",
      bankBranch: (d.bankBranch as string) ?? "",
      termsAndConditions: (d.termsAndConditions as string) ?? "",
      logoUrl: (d.logoUrl as string) ?? "",
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
  }, []);

  async function putSettings(overrides: Partial<BusinessSettings> & { gmailAppPassword?: string }) {
    const body = { ...saved, ...overrides };
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true as const, data: await res.json() };
    const d = await res.json().catch(() => ({}));
    return { ok: false as const, error: d.error as string | undefined };
  }

  // ── Business Identity ───────────────────────────────────────────────────

  function handleEditIdentity() {
    setIdentityForm({ name: saved.name, tagline: saved.tagline, email: saved.email, phone: saved.phone, gstin: saved.gstin, pan: saved.pan });
    setEditingIdentity(true);
  }
  function handleCancelIdentity() { setEditingIdentity(false); }

  async function handleSaveIdentity(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(identityForm.name,  rules.required("Business name cannot be empty."));
    const emailErr = validate(identityForm.email, rules.email());
    const phoneErr = validate(identityForm.phone, rules.phoneFlexible());
    const gstErr   = validate(identityForm.gstin, rules.maxLength(15), rules.gstin());
    const panErr   = validate(identityForm.pan, rules.maxLength(10), rules.pan());
    if (nameErr)  { toast({ type: "error", title: "Name required", message: nameErr });  return; }
    if (emailErr) { toast({ type: "error", title: "Invalid email", message: emailErr }); return; }
    if (phoneErr) { toast({ type: "error", title: "Invalid phone", message: phoneErr }); return; }
    if (gstErr)   { toast({ type: "error", title: "Invalid GSTIN", message: gstErr });   return; }
    if (panErr)   { toast({ type: "error", title: "Invalid PAN", message: panErr });     return; }
    setSavingIdentity(true);
    const result = await putSettings(identityForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingIdentity(false);
      toast({ type: "success", title: "Settings saved", message: "Business identity updated." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingIdentity(false);
  }

  // ── Address ──────────────────────────────────────────────────────────────

  function handleEditAddress() {
    setAddressForm({ address: saved.address, city: saved.city, state: saved.state, pincode: saved.pincode });
    setEditingAddress(true);
  }
  function handleCancelAddress() { setEditingAddress(false); }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    const pinErr = validate(addressForm.pincode, rules.pincode());
    if (pinErr) { toast({ type: "error", title: "Invalid pincode", message: pinErr }); return; }
    setSavingAddress(true);
    const result = await putSettings(addressForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingAddress(false);
      toast({ type: "success", title: "Settings saved", message: "Address updated." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingAddress(false);
  }

  // ── Bank Details ────────────────────────────────────────────────────────

  function handleEditBank() {
    setBankForm({
      bankName: saved.bankName, bankAccountName: saved.bankAccountName,
      bankAccountNumber: saved.bankAccountNumber, bankIfsc: saved.bankIfsc, bankBranch: saved.bankBranch,
    });
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
        bankName: f.bankName || data.bank || f.bankName,
        bankBranch: f.bankBranch || data.branch || f.bankBranch,
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
    if (Object.values(errors).some(Boolean)) {
      toast({ type: "error", title: "Check bank details", message: "Please fix the highlighted fields." });
      return;
    }
    setSavingBank(true);
    const result = await putSettings(bankForm);
    if (result.ok) {
      applyLoaded(result.data);
      setEditingBank(false);
      setBankErrors({});
      toast({ type: "success", title: "Settings saved", message: "Bank details updated." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingBank(false);
  }

  // ── Terms & Conditions ──────────────────────────────────────────────────

  function handleEditTerms() {
    setTermsForm(saved.termsAndConditions);
    setEditingTerms(true);
  }
  function handleCancelTerms() { setEditingTerms(false); }

  async function handleSaveTerms(e: React.FormEvent) {
    e.preventDefault();
    const termsErr = validate(termsForm, rules.maxLength(2000));
    if (termsErr) { toast({ type: "error", title: "Too long", message: termsErr }); return; }
    setSavingTerms(true);
    const result = await putSettings({ termsAndConditions: termsForm });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingTerms(false);
      toast({ type: "success", title: "Settings saved", message: "Terms & conditions updated." });
    } else {
      toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save settings." });
    }
    setSavingTerms(false);
  }

  // ── Logo ─────────────────────────────────────────────────────────────────

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
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
        toast({ type: "error", title: "Save failed", message: result.error ?? "Could not save logo." });
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
    } else {
      toast({ type: "error", title: "Failed", message: result.error ?? "Could not remove logo." });
    }
    setLogoUploading(false);
  }

  // ── Email config ──────────────────────────────────────────────────────────

  function handleEditEmail() {
    setEmailForm({ gmailUser: saved.gmailUser, gmailAppPassword: "" });
    setConfirmClear(false);
    setEditingEmail(true);
  }

  function handleCancelEmail() {
    setEmailForm({ gmailUser: "", gmailAppPassword: "" });
    setConfirmClear(false);
    setEditingEmail(false);
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    const gmailErr = validate(emailForm.gmailUser, rules.required("Enter a Gmail address."), rules.email("Enter a valid Gmail address."));
    if (gmailErr) { toast({ type: "error", title: "Gmail required", message: gmailErr }); return; }
    if (!saved.gmailAppPasswordSet && !emailForm.gmailAppPassword) {
      toast({ type: "error", title: "App Password required", message: "No existing password — enter one to enable email." });
      return;
    }
    setSavingEmail(true);
    const result = await putSettings({
      gmailUser: emailForm.gmailUser.trim(),
      ...(emailForm.gmailAppPassword ? { gmailAppPassword: emailForm.gmailAppPassword } : {}),
    });
    if (result.ok) {
      applyLoaded(result.data);
      setEditingEmail(false);
      toast({ type: "success", title: "Email configured", message: "Gmail credentials saved successfully." });
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
    } else {
      toast({ type: "error", title: "Failed", message: "Could not clear credentials." });
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
          <div {...animateSection(0, `card ${styles.cardPad}`)}>
            <h2 className={styles.sectionTitle}>Branding</h2>
            <p className={styles.stateHint}>Shown on the sidebar, login screen, and every printed invoice.</p>
            <div className={styles.emailFormGrid} style={{ alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 64, height: 64, borderRadius: "var(--c-radius-sm)",
                    border: "1px solid var(--c-border)", display: "flex", alignItems: "center",
                    justifyContent: "center", overflow: "hidden", background: "var(--c-bg-sub)", flexShrink: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded blob URL, not a static asset */}
                  <img src={saved.logoUrl || "/logo.png"} alt="Business logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
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
            </div>
          </div>

          {/* ── Business Identity ─────────────────────────────────────── */}
          <div {...animateSection(1, `card ${styles.cardPad}`)}>
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
              <form onSubmit={handleSaveIdentity}>
                <div className={styles.formGrid}>
                  <FormField label="Business Name *">
                    <Input value={identityForm.name} onChange={(e) => setIdentityForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Science Hub" required />
                  </FormField>
                  <FormField label="Tagline">
                    <Input value={identityForm.tagline} onChange={(e) => setIdentityForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Industrial & Laboratory Solutions" />
                  </FormField>
                  <FormField label="Business Email (on invoices)">
                    <Input type="email" value={identityForm.email} onChange={(e) => setIdentityForm((f) => ({ ...f, email: e.target.value }))} placeholder="e.g. info@sciencehub.com" />
                  </FormField>
                  <FormField label="Phone">
                    <Input value={identityForm.phone} onChange={(e) => setIdentityForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+\-\s]/g, "") }))} placeholder="e.g. +91-9968597044" maxLength={20} />
                  </FormField>
                  <FormField label="GSTIN">
                    <Input value={identityForm.gstin} onChange={(e) => setIdentityForm((f) => ({ ...f, gstin: e.target.value }))} placeholder="e.g. 07AAAAA0000A1Z5" className={styles.gstinInput} maxLength={15} />
                  </FormField>
                  <FormField label="PAN">
                    <Input value={identityForm.pan} onChange={(e) => setIdentityForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="e.g. AAAAA0000A" className={styles.gstinInput} maxLength={10} />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingIdentity} onClick={handleCancelIdentity}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingIdentity}>{savingIdentity ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Address ────────────────────────────────────────────────── */}
          <div {...animateSection(2, `card ${styles.cardPad}`)}>
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
              <form onSubmit={handleSaveAddress}>
                <p className={styles.stateHint}>
                  The <strong>State</strong> field determines intra-state (CGST+SGST) vs inter-state (IGST) for new invoices.
                </p>
                <div className={styles.formGrid}>
                  <FormField label="Street Address">
                    <Input value={addressForm.address} onChange={(e) => setAddressForm((f) => ({ ...f, address: e.target.value }))} placeholder="e.g. Pooth Khurd" />
                  </FormField>
                  <FormField label="City">
                    <Input value={addressForm.city} onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))} placeholder="e.g. Delhi" />
                  </FormField>
                  <FormField label="State">
                    <Input value={addressForm.state} onChange={(e) => setAddressForm((f) => ({ ...f, state: e.target.value }))} placeholder="e.g. Delhi" />
                  </FormField>
                  <FormField label="Pincode">
                    <Input value={addressForm.pincode} onChange={(e) => setAddressForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="e.g. 110039" maxLength={6} />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingAddress} onClick={handleCancelAddress}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingAddress}>{savingAddress ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Bank Details ───────────────────────────────────────────── */}
          <div {...animateSection(3, `card ${styles.cardPad}`)}>
            <SectionHeader title="Bank Details" editing={editingBank} onEdit={handleEditBank} />
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
              <form onSubmit={handleSaveBank}>
                <p className={styles.stateHint}>
                  Printed on every invoice so customers can pay by bank transfer. Only admins can edit these.
                </p>
                <div className={styles.formGrid}>
                  <FormField label="Bank Name *">
                    <Input value={bankForm.bankName} onChange={(e) => setBankForm((f) => ({ ...f, bankName: toTitleCase(e.target.value) }))} placeholder="e.g. HDFC Bank" required />
                  </FormField>
                  <FormField label="Account Holder Name">
                    <Input value={bankForm.bankAccountName} onChange={(e) => setBankForm((f) => ({ ...f, bankAccountName: e.target.value }))} placeholder="e.g. Science Hub" />
                  </FormField>
                  <FormField label="Account Number *">
                    <Input value={bankForm.bankAccountNumber} onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) }))} placeholder="e.g. 123456789012" className={styles.gstinInput} maxLength={18} required />
                  </FormField>
                  <div>
                    <FormField
                      label="IFSC Code *"
                      error={bankErrors.bankIfsc}
                      hint={ifscLookup.status === "loading" ? "Checking IFSC…" : undefined}
                    >
                      <Input
                        value={bankForm.bankIfsc}
                        onChange={handleBankIfscChange}
                        onBlur={(e) => handleBankIfscBlur(e.target.value)}
                        placeholder="e.g. HDFC0001234"
                        className={styles.gstinInput}
                        maxLength={11}
                        required
                      />
                    </FormField>
                    {ifscLookup.status === "found" && !bankErrors.bankIfsc && (
                      <p className={styles.ifscFoundHint}>✓ {ifscLookup.label}</p>
                    )}
                  </div>
                  <FormField label="Branch *">
                    <Input value={bankForm.bankBranch} onChange={(e) => setBankForm((f) => ({ ...f, bankBranch: toTitleCase(e.target.value) }))} placeholder="e.g. Noida" required />
                  </FormField>
                </div>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingBank} onClick={handleCancelBank}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingBank}>{savingBank ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Terms & Conditions ────────────────────────────────────────── */}
          <div {...animateSection(4, `card ${styles.cardPad}`)}>
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
              <form onSubmit={handleSaveTerms}>
                <p className={styles.stateHint}>One point per line — each line becomes a numbered item on the invoice.</p>
                <FormField label="Terms & Conditions">
                  <Textarea
                    value={termsForm}
                    onChange={(e) => setTermsForm(e.target.value)}
                    rows={6}
                    placeholder={"e.g. Interest @ 24%p.a would be charged after 45 days of Invoice\nMaterial sold strictly for lab use only"}
                  />
                </FormField>
                <div className={styles.formActionsRow}>
                  <Button type="button" variant="secondary" disabled={savingTerms} onClick={handleCancelTerms}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={savingTerms}>{savingTerms ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </div>

          {/* ── Email Configuration card (always visible, own edit state) ── */}
          <div {...animateSection(5, `card ${styles.cardPad}`)}>
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
              <form onSubmit={handleSaveEmail}>
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
                  <FormField label="Gmail Address (send-from — not your login email)">
                    <Input
                      type="email"
                      value={emailForm.gmailUser}
                      onChange={(e) => setEmailForm((f) => ({ ...f, gmailUser: e.target.value }))}
                      placeholder="yourbusiness@gmail.com"
                      required
                    />
                  </FormField>
                  <FormField label={saved.gmailAppPasswordSet ? "New App Password (leave blank to keep current)" : "App Password"}>
                    <Input
                      type="password"
                      value={emailForm.gmailAppPassword}
                      onChange={(e) => setEmailForm((f) => ({ ...f, gmailAppPassword: e.target.value }))}
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
                    <Button type="submit" variant="primary" disabled={savingEmail}>
                      {savingEmail ? "Saving…" : "Save Credentials"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
