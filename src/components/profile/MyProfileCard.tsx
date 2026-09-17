"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { rules, validate } from "@/lib/validation";
import { Input, FormField } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useDirty } from "@/lib/useDirty";
import { animateSection } from "@/lib/animateSection";
import { formatDate } from "@/lib/formatDate";
// Reuses the Admin Panel's own CSS module — this card is the exact same markup/styling that used
// to live inline on that page (see admin/page.tsx's "My Profile" section, extracted 2026-09-17 so
// staff/manager get their own /profile page without duplicating ~120 lines of profile/password UI).
import styles from "@/app/(dashboard)/admin/admin.module.css";

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { invoices: number };
}

const AVATAR_COLORS = {
  admin: { bg: "#6366f1", text: "#fff", badge: "#f59e0b", badgeIcon: "★" },
  manager: { bg: "#2563eb", text: "#fff", badge: "#6366f1", badgeIcon: "◈" },
  staff: { bg: "#22c55e", text: "#fff", badge: "#94a3b8", badgeIcon: "·" },
};

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  return (
    <span className={`${styles.roleBadge} ${isAdmin ? styles.roleBadgeAdmin : isManager ? styles.roleBadgeAdmin : styles.roleBadgeStaff}`}>
      {isAdmin ? "⬡ Admin" : isManager ? "◈ Manager" : "◌ Staff"}
    </span>
  );
}

function Msg({ m }: { m: { type: "ok" | "err"; text: string } }) {
  return <div className={`${styles.msg} ${m.type === "ok" ? styles.msgOk : styles.msgErr}`}>{m.text}</div>;
}

interface Props {
  /** Position within the caller's own animateSection sequence (default 0 — first card on the page). */
  sectionIndex?: number;
  /**
   * Called with the saved row after a successful name/email edit. admin/page.tsx uses this to patch
   * its own separately-fetched User Management table — that table doesn't share this card's fetch,
   * so without this callback an admin editing their own row here would see it go stale until reload.
   */
  onSaved?: (updated: Profile) => void;
}

// The "My Profile" card (view + Edit Profile / Change Password) — shared by the Admin Panel (admin
// role) and the standalone /profile page (staff/manager), so both read the exact same
// GET/PUT /api/admin/profile endpoint (already role-agnostic; it was only ever unreachable for
// non-admins because the one page that called it redirected them away first).
export function MyProfileCard({ sectionIndex = 0, onSaved }: Props) {
  const { update: updateSession } = useSession();
  const toast = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const profileDirty = useDirty(profileForm);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = useState<{ name?: string; email?: string }>({});
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwFieldErrors, setPwFieldErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  useEffect(() => {
    fetch("/api/admin/profile", { headers: { "x-no-loader": "1" } })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d?.id) throw new Error(d?.error ?? "Failed to load profile");
        setProfile(d);
        const initial = { name: d.name, email: d.email };
        setProfileForm(initial);
        profileDirty.markClean(initial);
      })
      .catch(() => setProfileLoadError(true))
      .finally(() => setProfileLoading(false));
    // profileDirty.markClean is stable in intent (only sets a baseline snapshot); this must run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = validate(profileForm.name, rules.required("Name is required."), rules.minLength(2), rules.maxLength(200));
    const emailErr = validate(profileForm.email, rules.required("Email is required."), rules.maxLength(254), rules.email());
    if (nameErr || emailErr) { setProfileFieldErrors({ name: nameErr ?? undefined, email: emailErr ?? undefined }); return; }
    setProfileFieldErrors({});
    setProfileSaving(true); setProfileMsg(null);
    const res = await fetch("/api/admin/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileForm) });
    const data = await res.json(); setProfileSaving(false);
    if (!res.ok) {
      const msg: string = data.error ?? "Could not update profile.";
      if (/email/i.test(msg)) setProfileFieldErrors({ email: msg });
      else if (/name/i.test(msg)) setProfileFieldErrors({ name: msg });
      else setProfileMsg({ type: "err", text: msg });
      return;
    }
    setProfile(data); setEditingProfile(false); setProfileMsg(null);
    onSaved?.(data);
    await updateSession({ name: data.name, email: data.email, role: data.role });
    toast({ type: "success", title: "Profile updated", message: "Your name and email have been saved." });
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const curErr = validate(pwForm.current, rules.required("Current password is required."));
    const nextErr = validate(pwForm.next, rules.required("New password is required."), rules.minLength(8, "Password must be at least 8 characters."));
    const confErr = validate(pwForm.confirm, rules.required("Please confirm your new password."), rules.passwordMatch(pwForm.next));
    if (curErr || nextErr || confErr) { setPwFieldErrors({ current: curErr ?? undefined, next: nextErr ?? undefined, confirm: confErr ?? undefined }); return; }
    setPwFieldErrors({});
    setPwSaving(true); setPwMsg(null);
    const res = await fetch("/api/admin/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) });
    const data = await res.json(); setPwSaving(false);
    if (!res.ok) {
      const msg: string = data.error ?? "Could not update password.";
      if (/current password/i.test(msg)) setPwFieldErrors({ current: msg });
      else if (/new password/i.test(msg)) setPwFieldErrors({ next: msg });
      else setPwMsg({ type: "err", text: msg });
      return;
    }
    setPwForm({ current: "", next: "", confirm: "" }); setChangingPw(false); setPwMsg(null); setPwFieldErrors({});
    // The server bumps tokenVersion on a password change, which invalidates every JWT issued under
    // the old one — including this browser's own current session. Left alone, that desync would
    // only surface later (the next periodic revalidation, or an unrelated update() call elsewhere in
    // the same session) as a confusing silent sign-out. Sign out deliberately, right now, with a
    // clear reason instead.
    toast({ type: "success", title: "Password changed", message: "Please sign in again with your new password." });
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <>
      {profileSaving && <OverlayLoader text="Saving profile…" />}
      {pwSaving && <OverlayLoader text="Updating password…" />}

      <div id="profile" {...animateSection(sectionIndex, "card")}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>My Profile</h2>
          {!profileLoading && !profileLoadError && (
            <Button variant="secondary" onClick={() => { profileDirty.markClean(profileForm); setEditingProfile(true); setProfileMsg(null); setProfileFieldErrors({}); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </Button>
          )}
        </div>
        <div className={styles.sectionBody}>
          {profileLoading ? (
            <div className={styles.skRow}>
              <div className={styles.skAvatar} />
              <div className={styles.skCol}>
                <div className={styles.skLineLg} />
                <div className={styles.skLineMd} />
                <div className={styles.skBadgeRow}>
                  <div className={styles.skPill} />
                  <div className={styles.skLineSelfCenter} />
                </div>
              </div>
            </div>
          ) : profileLoadError || !profile ? (
            <Msg m={{ type: "err", text: "Couldn't load your profile. Please refresh the page and try again." }} />
          ) : (
            <div className={styles.profileRow}>
              <div className={styles.avatarWrapRelative}>
                {(() => {
                  const c = AVATAR_COLORS[(profile?.role ?? "staff") as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.staff;
                  return (
                    <>
                      <div className={`${styles.avatarCircle} ${styles.avatarCircleLg}`} style={{ background: c.bg, color: c.text, borderColor: c.badge }}>
                        {profile?.name?.[0]?.toUpperCase()}
                      </div>
                      <div className={styles.avatarBadgeLg} style={{ background: c.badge }}>
                        {c.badgeIcon}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className={styles.profileMain}>
                <div className={styles.profileName}>{profile?.name}</div>
                <div className={styles.profileEmail}>
                  {profile?.email}
                  <span className={styles.loginEmailTag}>login email</span>
                </div>
                <div className={styles.profileMetaRow}>
                  <RoleBadge role={profile?.role ?? ""} />
                  <span className={styles.metaText}>Joined {profile?.createdAt ? formatDate(profile.createdAt) : "—"}</span>
                  <span className={styles.metaText}>· {profile?._count?.invoices ?? 0} invoices created</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.sectionFooter}>
          <div className={styles.footerRow}>
            <div>
              <div className={styles.footerTitle}>Password</div>
              <div className={styles.footerSub}>Change your login password</div>
            </div>
            <Button variant="secondary" onClick={() => { setChangingPw(true); setPwMsg(null); setPwFieldErrors({}); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Change Password
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={editingProfile}
        title="Edit Profile"
        variant="fullscreen"
        onClose={() => { if (profileSaving) return; setEditingProfile(false); setProfileForm({ name: profile?.name ?? "", email: profile?.email ?? "" }); setProfileFieldErrors({}); setProfileMsg(null); }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => { setEditingProfile(false); setProfileForm({ name: profile?.name ?? "", email: profile?.email ?? "" }); setProfileFieldErrors({}); setProfileMsg(null); }}>Cancel</Button>
            <Button type="submit" form="edit-profile-form" variant="primary" disabled={profileSaving || !profileDirty.isDirty || !profileForm.name.trim() || !profileForm.email.trim()}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-profile-form" onSubmit={saveProfile} className={styles.formCol} noValidate>
          <div className={styles.fg2}>
            <FormField label="Full Name" required error={profileFieldErrors.name}>
              <Input className={`${styles.inp} ${profileFieldErrors.name ? styles.inpError : ""}`} value={profileForm.name} onChange={(e) => { setProfileForm((p) => ({ ...p, name: e.target.value })); setProfileFieldErrors((prev) => ({ ...prev, name: undefined })); }} maxLength={200} />
            </FormField>
            <FormField label="Login Email — used to sign in to this app" required error={profileFieldErrors.email}>
              <Input className={`${styles.inp} ${profileFieldErrors.email ? styles.inpError : ""}`} type="email" value={profileForm.email} onChange={(e) => { setProfileForm((p) => ({ ...p, email: e.target.value })); setProfileFieldErrors((prev) => ({ ...prev, email: undefined })); }} maxLength={254} />
            </FormField>
          </div>
          {profileMsg && <Msg m={profileMsg} />}
        </form>
      </Modal>

      <Modal
        open={changingPw}
        title="Change Password"
        variant="fullscreen"
        onClose={() => { if (pwSaving) return; setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); setPwMsg(null); setPwFieldErrors({}); }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => { setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); setPwMsg(null); setPwFieldErrors({}); }}>Cancel</Button>
            <Button type="submit" form="change-password-form" variant="primary" disabled={pwSaving}>Update Password</Button>
          </>
        }
      >
        <form id="change-password-form" onSubmit={savePassword} className={styles.formCol} noValidate>
          <div className={styles.fg2}>
            <FormField label="Current Password" required error={pwFieldErrors.current}>
              <Input className={`${styles.inp} ${pwFieldErrors.current ? styles.inpError : ""}`} type="password" value={pwForm.current} onChange={(e) => { setPwForm((p) => ({ ...p, current: e.target.value })); setPwFieldErrors((prev) => ({ ...prev, current: undefined })); }} placeholder="••••••••" autoComplete="current-password" maxLength={72} />
            </FormField>
            <FormField label="New Password" required error={pwFieldErrors.next}>
              <Input className={`${styles.inp} ${pwFieldErrors.next ? styles.inpError : ""}`} type="password" value={pwForm.next} onChange={(e) => { setPwForm((p) => ({ ...p, next: e.target.value })); setPwFieldErrors((prev) => ({ ...prev, next: undefined })); }} placeholder="min. 8 characters" autoComplete="new-password" maxLength={72} />
            </FormField>
            <FormField label="Confirm Password" required error={pwFieldErrors.confirm}>
              <Input className={`${styles.inp} ${pwFieldErrors.confirm ? styles.inpError : ""}`} type="password" value={pwForm.confirm} onChange={(e) => { setPwForm((p) => ({ ...p, confirm: e.target.value })); setPwFieldErrors((prev) => ({ ...prev, confirm: undefined })); }} placeholder="repeat new password" autoComplete="new-password" maxLength={72} />
            </FormField>
          </div>
          {pwMsg && <Msg m={pwMsg} />}
        </form>
      </Modal>
    </>
  );
}
