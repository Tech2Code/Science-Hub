"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import styles from "./settings.module.css";

interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string;
  gmailUser: string; gmailAppPasswordSet: boolean;
}

const EMPTY: BusinessSettings = {
  name: "", tagline: "", email: "", phone: "",
  address: "", city: "", state: "", pincode: "", gstin: "",
  gmailUser: "", gmailAppPasswordSet: false,
};

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

export default function SettingsPage() {
  const [saved, setSaved] = useState<BusinessSettings>(EMPTY);
  const [form, setForm] = useState<BusinessSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Email config has its own independent edit state
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ gmailUser: "", gmailAppPassword: "" });
  const [savingEmail, setSavingEmail] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const toast = useToast();

  function applyLoaded(d: Record<string, string | boolean>) {
    const s: BusinessSettings = {
      name: (d.name as string) ?? "", tagline: (d.tagline as string) ?? "", email: (d.email as string) ?? "",
      phone: (d.phone as string) ?? "", address: (d.address as string) ?? "", city: (d.city as string) ?? "",
      state: (d.state as string) ?? "", pincode: (d.pincode as string) ?? "", gstin: (d.gstin as string) ?? "",
      gmailUser: (d.gmailUser as string) ?? "", gmailAppPasswordSet: Boolean(d.gmailAppPasswordSet),
    };
    setSaved(s);
    setForm(s);
  }

  useEffect(() => {
    fetch("/api/settings", { headers: { "x-no-loader": "1" } })
      .then((r) => r.json())
      .then(applyLoaded)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Business details ──────────────────────────────────────────────────────

  function setField(field: keyof BusinessSettings) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleEdit() { setForm(saved); setEditing(true); }
  function handleCancel() { setForm(saved); setEditing(false); }

  const bizKeys: (keyof BusinessSettings)[] = ["name", "tagline", "email", "phone", "address", "city", "state", "pincode", "gstin"];
  const hasChanges = bizKeys.some((k) => form[k] !== saved[k]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(form.name,  rules.required("Business name cannot be empty."));
    const emailErr = validate(form.email, rules.email());
    const pinErr   = validate(form.pincode, rules.pincode());
    const gstErr   = validate(form.gstin, rules.maxLength(15), rules.gstin());
    if (nameErr)  { toast({ type: "error", title: "Name required",    message: nameErr });  return; }
    if (emailErr) { toast({ type: "error", title: "Invalid email",    message: emailErr }); return; }
    if (pinErr)   { toast({ type: "error", title: "Invalid pincode",  message: pinErr });   return; }
    if (gstErr)   { toast({ type: "error", title: "Invalid GSTIN",    message: gstErr });   return; }
    if (!hasChanges) { setEditing(false); return; }
    setSaving(true);
    try {
      const body = { ...form, gmailUser: saved.gmailUser };
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        applyLoaded(await res.json());
        setEditing(false);
        toast({ type: "success", title: "Settings saved", message: "Business details updated." });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Save failed", message: d.error ?? "Could not save settings." });
      }
    } catch {
      toast({ type: "error", title: "Save failed", message: "Network error." });
    }
    setSaving(false);
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
    try {
      const body = {
        ...saved,
        gmailUser: emailForm.gmailUser.trim(),
        gmailAppPassword: emailForm.gmailAppPassword || undefined,
      };
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        applyLoaded(await res.json());
        setEditingEmail(false);
        toast({ type: "success", title: "Email configured", message: "Gmail credentials saved successfully." });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Save failed", message: d.error ?? "Could not save email settings." });
      }
    } catch {
      toast({ type: "error", title: "Save failed", message: "Network error." });
    }
    setSavingEmail(false);
  }

  async function handleClearEmail() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setSavingEmail(true);
    try {
      const body = { ...saved, gmailUser: "", gmailAppPassword: "" };
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        applyLoaded(await res.json());
        setEditingEmail(false);
        setConfirmClear(false);
        toast({ type: "success", title: "Credentials cleared", message: "Email configuration has been removed." });
      } else {
        toast({ type: "error", title: "Failed", message: "Could not clear credentials." });
      }
    } catch {
      toast({ type: "error", title: "Failed", message: "Network error." });
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
        {!loading && !editing && !editingEmail && (
          <Button variant="editOutline" onClick={handleEdit}>Edit Details</Button>
        )}
      </div>

      {/* ── Skeleton ─────────────────────────────────────────────────── */}
      {loading ? (
        <>
          {[5, 4].map((count, ci) => (
            <div key={ci} className={`card ${styles.cardPad} ${styles.skeletonCardBody}`}>
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
          <div className={`card ${styles.cardPad} ${styles.skeletonCardBody}`}>
            <Sk w={160} h={13} />
            <Sk w="50%" h={15} />
          </div>
        </>

      ) : !editing ? (
        <>
          {/* ── View: Business Identity ───────────────────────────────── */}
          <div className={`card ${styles.cardPad}`}>
            <h2 className={styles.sectionTitle}>Business Identity</h2>
            <div className={styles.infoGrid}>
              <InfoRow label="Business Name" value={saved.name} />
              <InfoRow label="Tagline" value={saved.tagline} />
              <InfoRow label="Business Email (on invoices)" value={saved.email} />
              <InfoRow label="Phone" value={saved.phone} />
              <InfoRow label="GSTIN" value={saved.gstin} mono />
            </div>
          </div>

          {/* ── View: Address ─────────────────────────────────────────── */}
          <div className={`card ${styles.cardPad}`}>
            <h2 className={styles.sectionTitle}>Address</h2>
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
          </div>

          {/* ── Email Configuration card (always visible, own edit state) ── */}
          <div className={`card ${styles.cardPad}`}>
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

      ) : (
        /* ── Edit mode: Business details only (no email here) ─────────── */
        <form onSubmit={handleSave}>
          <div className={`card ${styles.cardPad}`}>
            <h2 className={styles.sectionTitle}>Business Identity</h2>
            <div className={styles.formGrid}>
              <FormField label="Business Name *">
                <Input value={form.name} onChange={setField("name")} placeholder="e.g. Science Hub" required />
              </FormField>
              <FormField label="Tagline">
                <Input value={form.tagline} onChange={setField("tagline")} placeholder="e.g. Industrial & Laboratory Solutions" />
              </FormField>
              <FormField label="Business Email (on invoices)">
                <Input type="email" value={form.email} onChange={setField("email")} placeholder="e.g. info@sciencehub.com" />
              </FormField>
              <FormField label="Phone">
                <Input value={form.phone} onChange={setField("phone")} placeholder="e.g. +91-9968597044" />
              </FormField>
              <FormField label="GSTIN">
                <Input value={form.gstin} onChange={setField("gstin")} placeholder="e.g. 07AAAAA0000A1Z5" className={styles.gstinInput} />
              </FormField>
            </div>
          </div>

          <div className={`card ${styles.cardSpaced}`}>
            <h2 className={styles.sectionTitle}>Address</h2>
            <p className={styles.stateHint}>
              The <strong>State</strong> field determines intra-state (CGST+SGST) vs inter-state (IGST) for new invoices.
            </p>
            <div className={styles.formGrid}>
              <FormField label="Street Address">
                <Input value={form.address} onChange={setField("address")} placeholder="e.g. Pooth Khurd" />
              </FormField>
              <FormField label="City">
                <Input value={form.city} onChange={setField("city")} placeholder="e.g. Delhi" />
              </FormField>
              <FormField label="State">
                <Input value={form.state} onChange={setField("state")} placeholder="e.g. Delhi" />
              </FormField>
              <FormField label="Pincode">
                <Input value={form.pincode} onChange={setField("pincode")} placeholder="e.g. 110039" />
              </FormField>
            </div>
          </div>

          <div className={styles.formActionsRow}>
            <Button type="button" variant="secondary" disabled={saving} onClick={handleCancel}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || !hasChanges}>
              {saving ? "Saving…" : hasChanges ? "Save Changes" : "No Changes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
