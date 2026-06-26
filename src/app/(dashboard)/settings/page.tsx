"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";

interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string;
  gmailUser: string; gmailAppPassword: string;
}

const EMPTY: BusinessSettings = {
  name: "", tagline: "", email: "", phone: "",
  address: "", city: "", state: "", pincode: "", gstin: "",
  gmailUser: "", gmailAppPassword: "",
};

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "var(--c-border)",
      animation: "skPulse 1.4s ease-in-out infinite",
    }} />
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--c-text-4)" }}>{label}</span>
      <span style={{
        fontSize: "0.875rem", color: value ? "var(--c-text)" : "var(--c-text-4)",
        fontFamily: mono ? "var(--font-mono)" : undefined,
        fontStyle: value ? undefined : "italic",
      }}>
        {value || "Not set"}
      </span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.35rem",
      fontSize: "0.75rem", fontWeight: 600,
      color: ok ? "var(--c-success, #16a34a)" : "var(--c-text-4)",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: ok ? "var(--c-success, #16a34a)" : "var(--c-border)",
        flexShrink: 0,
      }} />
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

  function applyLoaded(d: Record<string, string>) {
    const s: BusinessSettings = {
      name: d.name ?? "", tagline: d.tagline ?? "", email: d.email ?? "",
      phone: d.phone ?? "", address: d.address ?? "", city: d.city ?? "",
      state: d.state ?? "", pincode: d.pincode ?? "", gstin: d.gstin ?? "",
      gmailUser: d.gmailUser ?? "", gmailAppPassword: d.gmailAppPassword ?? "",
    };
    setSaved(s);
    setForm(s);
  }

  useEffect(() => {
    fetch("/api/settings")
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
      const body = { ...form, gmailUser: saved.gmailUser, gmailAppPassword: saved.gmailAppPassword };
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
    if (!saved.gmailAppPassword && !emailForm.gmailAppPassword) {
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
  const emailConfigured = !!(saved.gmailUser && saved.gmailAppPassword);

  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
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
              <div key={ci} className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <Sk w={ci === 0 ? 140 : 100} h={13} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <Sk w={70} h={10} />
                      <Sk w="80%" h={15} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <Sk w={160} h={13} />
              <Sk w="50%" h={15} />
            </div>
          </>

        ) : !editing ? (
          <>
            {/* ── View: Business Identity ───────────────────────────────── */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "1.25rem" }}>Business Identity</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
                <InfoRow label="Business Name" value={saved.name} />
                <InfoRow label="Tagline" value={saved.tagline} />
                <InfoRow label="Business Contact Email (printed on invoices)" value={saved.email} />
                <InfoRow label="Phone" value={saved.phone} />
                <InfoRow label="GSTIN" value={saved.gstin} mono />
              </div>
            </div>

            {/* ── View: Address ─────────────────────────────────────────── */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "1.25rem" }}>Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
                <InfoRow label="Street Address" value={saved.address} />
                <InfoRow label="City" value={saved.city} />
                <InfoRow label="State" value={saved.state} />
                <InfoRow label="Pincode" value={saved.pincode} />
              </div>
              {address && (
                <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--c-border)" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--c-text-4)" }}>Full Address</span>
                  <p style={{ marginTop: 4, fontSize: "0.875rem", color: "var(--c-text-2)" }}>{address}</p>
                </div>
              )}
            </div>

            {/* ── Email Configuration card (always visible, own edit state) ── */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "0.25rem" }}>
                    Gmail — for sending invoice PDFs via email
                  </h2>
                  <p style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginBottom: "0.4rem" }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
                    <InfoRow label="Gmail (send-from address — not your login)" value={saved.gmailUser} />
                    <InfoRow label="App Password" value="••••••••••••••••" />
                  </div>
                ) : (
                  <div style={{
                    padding: "1rem 1.25rem",
                    borderRadius: 8,
                    background: "var(--c-surface-2, var(--c-border))",
                    border: "1px dashed var(--c-border)",
                  }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--c-text-3)", marginBottom: "0.25rem" }}>
                      No email credentials set.
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "var(--c-text-4)" }}>
                      Invoices cannot be emailed until a Gmail address and App Password are configured.
                    </p>
                  </div>
                )
              ) : (
                /* Inline edit sub-mode */
                <form onSubmit={handleSaveEmail}>
                  <div style={{
                    padding: "1rem 1.25rem",
                    borderRadius: 8,
                    border: "1px solid var(--c-border)",
                    background: "var(--c-surface-2, transparent)",
                    marginBottom: "1rem",
                  }}>
                    <p style={{ fontSize: "0.8rem", color: "var(--c-text-4)", marginBottom: "0.35rem" }}>
                      Use a Gmail address with{" "}
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--c-primary)", textDecoration: "underline" }}
                      >
                        2-Step Verification enabled
                      </a>
                      . Generate an App Password at{" "}
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--c-primary)", textDecoration: "underline" }}
                      >
                        myaccount.google.com/apppasswords
                      </a>
                      {" "}— select "Mail" and copy the 16-character code.
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                    <FormField label="Gmail Address (send-from — not your login email)">
                      <Input
                        type="email"
                        value={emailForm.gmailUser}
                        onChange={(e) => setEmailForm((f) => ({ ...f, gmailUser: e.target.value }))}
                        placeholder="yourbusiness@gmail.com"
                        required
                      />
                    </FormField>
                    <FormField label={saved.gmailAppPassword ? "New App Password (leave blank to keep current)" : "App Password"}>
                      <Input
                        type="password"
                        value={emailForm.gmailAppPassword}
                        onChange={(e) => setEmailForm((f) => ({ ...f, gmailAppPassword: e.target.value }))}
                        placeholder={saved.gmailAppPassword ? "Leave blank to keep existing" : "16-character App Password"}
                        autoComplete="new-password"
                      />
                    </FormField>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                    {/* Clear / danger side */}
                    {emailConfigured && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {confirmClear ? (
                          <>
                            <span style={{ fontSize: "0.8rem", color: "var(--c-danger, #dc2626)", fontWeight: 500 }}>
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
                    <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
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
            <div className="card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "1.25rem" }}>Business Identity</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                <FormField label="Business Name *">
                  <Input value={form.name} onChange={setField("name")} placeholder="e.g. Science Hub" required />
                </FormField>
                <FormField label="Tagline">
                  <Input value={form.tagline} onChange={setField("tagline")} placeholder="e.g. Industrial & Laboratory Solutions" />
                </FormField>
                <FormField label="Business Contact Email (printed on invoices)">
                  <Input type="email" value={form.email} onChange={setField("email")} placeholder="e.g. info@sciencehub.com" />
                </FormField>
                <FormField label="Phone">
                  <Input value={form.phone} onChange={setField("phone")} placeholder="e.g. +91-9968597044" />
                </FormField>
                <FormField label="GSTIN">
                  <Input value={form.gstin} onChange={setField("gstin")} placeholder="e.g. 07AAAAA0000A1Z5" style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }} />
                </FormField>
              </div>
            </div>

            <div className="card" style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-3)", marginBottom: "1.25rem" }}>Address</h2>
              <p style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginBottom: "1rem" }}>
                The <strong>State</strong> field determines intra-state (CGST+SGST) vs inter-state (IGST) for new invoices.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <Button type="button" variant="secondary" disabled={saving} onClick={handleCancel}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving || !hasChanges}>
                {saving ? "Saving…" : hasChanges ? "Save Changes" : "No Changes"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
