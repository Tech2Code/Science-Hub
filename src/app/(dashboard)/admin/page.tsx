"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { rules, validate } from "@/lib/validation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import styles from "./admin.module.css";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { invoices: number };
}

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  entityId: string | null;
  entityType: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
}

type Role = "admin" | "staff";

// ── Action metadata ──────────────────────────────────────
const ACTION_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  create_invoice:  { label: "Invoice Created",   color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)"  },
  update_invoice:  { label: "Invoice Updated",   color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)"  },
  delete_invoice:  { label: "Invoice Deleted",   color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)"   },
  record_payment:  { label: "Payment Recorded",  color: "var(--c-green-text)",  bg: "var(--c-green-bg)",  border: "var(--c-green-border)" },
  update_payment:  { label: "Payment Updated",   color: "var(--c-green-text)",  bg: "var(--c-green-bg)",  border: "var(--c-green-border)" },
  add_customer:    { label: "Customer Added",    color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  update_customer: { label: "Customer Updated",  color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  delete_customer: { label: "Customer Deleted",  color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)"   },
  add_product:     { label: "Product Added",     color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)"       },
  update_product:  { label: "Product Updated",   color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)"       },
  delete_product:  { label: "Product Deleted",   color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)"   },
  add_brand:       { label: "Brand Added",       color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)"       },
  delete_brand:    { label: "Brand Deleted",     color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)"   },
  add_category:    { label: "Category Added",    color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)"       },
  add_user:        { label: "User Created",      color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)"  },
  update_user:     { label: "User Updated",      color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)"  },
  delete_user:     { label: "User Deleted",      color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)"   },
  update_profile:  { label: "Profile Updated",   color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)"       },
  change_password: { label: "Password Changed",  color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  create_return:          { label: "Return Recorded",        color: "var(--c-orange)",      bg: "var(--c-orange-bg)", border: "var(--c-orange-border)" },
  add_vendor:             { label: "Vendor Added",           color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)" },
  update_vendor:          { label: "Vendor Updated",         color: "var(--c-text-2)",      bg: "var(--c-bg-sub)",    border: "var(--c-border)" },
  delete_vendor:          { label: "Vendor Deleted",         color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)" },
  create_purchase_bill:   { label: "Purchase Bill Created",  color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)" },
  update_purchase_bill:   { label: "Purchase Bill Updated",  color: "var(--c-blue)",        bg: "var(--c-blue-bg)",   border: "var(--c-blue-border)" },
  delete_purchase_bill:   { label: "Purchase Bill Deleted",  color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)" },
  record_purchase_payment:{ label: "Purchase Payment",       color: "var(--c-green-text)",  bg: "var(--c-green-bg)",  border: "var(--c-green-border)" },
};

function ActionBadge({ action }: { action: string }) {
  const m = ACTION_META[action] ?? { label: action, color: "var(--c-text-3)", bg: "var(--c-bg-sub)", border: "var(--c-border)" };
  return (
    <span className={styles.actionBadge} style={{ color: m.color, background: m.bg, borderColor: m.border }}>{m.label}</span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span className={`${styles.roleBadge} ${isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeStaff}`}>
      {isAdmin ? "⬡ Admin" : "◌ Staff"}
    </span>
  );
}

const AVATAR_COLORS = {
  admin: { bg: "#6366f1", text: "#fff", badge: "#f59e0b", badgeIcon: "★" },
  staff: { bg: "#22c55e", text: "#fff", badge: "#94a3b8", badgeIcon: "·" },
};

function UserAvatar({ name, role, isSelf, size = 30 }: { name: string; role: string; isSelf?: boolean; size?: number }) {
  const c = AVATAR_COLORS[role as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.staff;
  return (
    <div className={styles.avatarWrap} style={{ width: size, height: size }}>
      <div
        className={`${styles.avatar} ${isSelf ? styles.avatarSelf : styles.avatarPlain}`}
        style={{
          width: size, height: size,
          background: c.bg, color: c.text,
          borderColor: isSelf ? c.badge : `${c.bg}99`,
          fontSize: size * 0.4,
        }}
      >
        {name?.[0]?.toUpperCase()}
      </div>
      {/* Role badge */}
      <div className={styles.roleDot} style={{ background: c.badge }}>
        {c.badgeIcon}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Msg({ m }: { m: { type: "ok" | "err"; text: string } }) {
  return (
    <div className={`${styles.msg} ${m.type === "ok" ? styles.msgOk : styles.msgErr}`}>{m.text}</div>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function AdminPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";
  const toast = useToast();

  // Redirect non-admins immediately
  useEffect(() => {
    if (session && session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, router]);

  // ── Profile state ─────────────────────────────────────────────
  const [profile, setProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── User Management ───────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "staff" as Role });
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Real-time field errors for add form
  const [addFieldErrors, setAddFieldErrors] = useState<{ name?: string; email?: string; confirmPassword?: string; password?: string }>({});
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "staff" as Role, newPassword: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Activity Log ─────────────────────────────────────────────
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsFilter, setLogsFilter] = useState(""); // filter by userId
  const [logsSearch, setLogsSearch] = useState(""); // text search
  const LOGS_LIMIT = 20;

  const loadLogs = useCallback(async (page: number, userId: string) => {
    setLogsLoading(true);
    const offset = (page - 1) * LOGS_LIMIT;
    const qs = new URLSearchParams({ limit: String(LOGS_LIMIT), offset: String(offset) });
    if (userId) qs.set("userId", userId);
    const res = await fetch(`/api/admin/activity?${qs}`, { headers: { "x-no-loader": "1" } });
    const data = await res.json();
    setLogsLoading(false);
    if (res.ok) {
      setLogs(data.logs);
      setLogsTotal(data.total);
      setLogsPage(page);
    }
  }, []);

  useEffect(() => { fetch("/api/admin/profile", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(d => { setProfile(d); setProfileForm({ name: d.name, email: d.email }); }).finally(() => setProfileLoading(false)); }, []);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!isAdmin) return; setUsersLoading(true); fetch("/api/admin/users", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setUsers).finally(() => setUsersLoading(false)); }, [isAdmin]);
  useEffect(() => { if (isAdmin) loadLogs(1, logsFilter); }, [isAdmin, logsFilter, loadLogs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(profileForm.name,  rules.required("Name is required."));
    const emailErr = validate(profileForm.email, rules.required("Email is required."), rules.email());
    if (nameErr || emailErr) { setProfileMsg({ type: "err", text: nameErr ?? emailErr ?? "" }); return; }
    setProfileSaving(true); setProfileMsg(null);
    const res = await fetch("/api/admin/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileForm) });
    const data = await res.json(); setProfileSaving(false);
    if (!res.ok) { setProfileMsg({ type: "err", text: data.error }); return; }
    setProfile(data); setEditingProfile(false); setProfileMsg(null);
    await updateSession({ name: data.name, email: data.email, role: data.role });
    toast({ type: "success", title: "Profile updated", message: "Your name and email have been saved." });
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const curErr  = validate(pwForm.current, rules.required("Current password is required."));
    const nextErr = validate(pwForm.next,    rules.required("New password is required."), rules.minLength(8, "Password must be at least 8 characters."));
    const confErr = validate(pwForm.confirm, rules.required("Please confirm your new password."), rules.passwordMatch(pwForm.next));
    if (curErr || nextErr || confErr) { setPwMsg({ type: "err", text: curErr ?? nextErr ?? confErr ?? "" }); return; }
    setPwSaving(true); setPwMsg(null);
    const res = await fetch("/api/admin/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) });
    const data = await res.json(); setPwSaving(false);
    if (!res.ok) { setPwMsg({ type: "err", text: data.error }); return; }
    setPwForm({ current: "", next: "", confirm: "" }); setChangingPw(false); setPwMsg(null);
    toast({ type: "success", title: "Password changed", message: "Your new password is active." });
  }

  function handleAddFormChange(field: keyof typeof addForm, value: string) {
    const updated = { ...addForm, [field]: value };
    setAddForm(prev => ({ ...prev, [field]: value }));
    // Real-time name uniqueness check
    if (field === "name") {
      const trimmed = value.trim();
      const match = trimmed ? users.find(u => u.name.trim().toLowerCase() === trimmed.toLowerCase()) : null;
      setAddFieldErrors(prev => ({ ...prev, name: match ? `A user named "${match.name}" already exists.` : undefined }));
    }
    // Real-time confirm password check
    if (field === "confirmPassword" || field === "password") {
      const pw = field === "password" ? value : addForm.password;
      const conf = field === "confirmPassword" ? value : addForm.confirmPassword;
      if (conf && pw !== conf) {
        setAddFieldErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match." }));
      } else {
        setAddFieldErrors(prev => ({ ...prev, confirmPassword: undefined }));
      }
      if (field === "password" && value && value.length < 8) {
        setAddFieldErrors(prev => ({ ...prev, password: "Password must be at least 8 characters." }));
      } else if (field === "password") {
        setAddFieldErrors(prev => ({ ...prev, password: undefined }));
      }
    }
    // Debounced email uniqueness check
    if (field === "email") {
      setAddFieldErrors(prev => ({ ...prev, email: undefined }));
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
      if (!value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return;
      setEmailCheckLoading(true);
      emailCheckTimer.current = setTimeout(async () => {
        const match = users.find(u => u.email.toLowerCase() === value.trim().toLowerCase());
        setEmailCheckLoading(false);
        if (match) {
          setAddFieldErrors(prev => ({ ...prev, email: "Email already exists." }));
        }
      }, 400);
    }
    void updated;
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(addForm.name,            rules.required("Name is required."));
    const emailErr = validate(addForm.email,           rules.required("Email is required."), rules.email());
    const pwErr    = validate(addForm.password,        rules.required("Password is required."), rules.minLength(8, "Password must be at least 8 characters."));
    const confErr  = validate(addForm.confirmPassword, rules.required("Please confirm the password."), rules.passwordMatch(addForm.password));
    if (nameErr || emailErr || pwErr || confErr) { setAddMsg({ type: "err", text: nameErr ?? emailErr ?? pwErr ?? confErr ?? "" }); return; }
    setAddSaving(true); setAddMsg(null);
    const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
    const data = await res.json(); setAddSaving(false);
    if (!res.ok) { setAddMsg({ type: "err", text: data.error }); return; }
    setUsers(prev => [...prev, data]); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddOpen(false); setAddMsg(null);
    toast({ type: "success", title: "User created", message: `"${data.name}" added to the system.` });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    const nameErr  = validate(editForm.name,        rules.required("Name is required."));
    const emailErr = validate(editForm.email,       rules.required("Email is required."), rules.email());
    const pwErr    = editForm.newPassword ? validate(editForm.newPassword, rules.minLength(8, "New password must be at least 8 characters.")) : null;
    if (nameErr || emailErr || pwErr) { setEditMsg({ type: "err", text: nameErr ?? emailErr ?? pwErr ?? "" }); return; }
    setEditSaving(true); setEditMsg(null);
    const body: Record<string, string> = { name: editForm.name, email: editForm.email, role: editForm.role };
    if (editForm.newPassword) body.newPassword = editForm.newPassword;
    const res = await fetch(`/api/admin/users/${editUser.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); setEditSaving(false);
    if (!res.ok) { setEditMsg({ type: "err", text: data.error }); return; }
    setUsers(prev => prev.map(u => u.id === data.id ? data : u)); setEditUser(null); setEditMsg(null);
    toast({ type: "success", title: "User updated", message: `${data.name}'s details saved.` });
  }

  async function deleteUser() {
    if (!deleteConfirm) return;
    const target = deleteConfirm; // capture before any async state change
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
      const data = await res.json();
      setDeleteLoading(false);
      setDeleteConfirm(null);
      if (!res.ok) {
        toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete user." });
        return;
      }
      setUsers(prev => prev.filter(u => u.id !== target.id));
      toast({ type: "success", title: "User deleted", message: `"${target.name}" removed.` });
    } catch {
      setDeleteLoading(false);
      setDeleteConfirm(null);
      toast({ type: "error", title: "Delete failed", message: "Network error. Please try again." });
    }
  }

  const selfId = session?.user?.id;

  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / LOGS_LIMIT));

  // Client-side text search filters the current page only
  const visibleLogs = logsSearch
    ? logs.filter(l => l.details.toLowerCase().includes(logsSearch.toLowerCase()) || l.user.name.toLowerCase().includes(logsSearch.toLowerCase()))
    : logs;

  if (!isAdmin && session) return null; // redirect in effect

  const ROLE_INFO = [
    {
      role: "admin", color: "var(--c-blue)", dotBg: "#f59e0b",
      perms: ["All business features", "Manage users (create / edit / delete)", "Reset any user's password", "View full activity log"],
    },
    {
      role: "staff", color: "var(--c-text-3)", dotBg: "#94a3b8",
      perms: ["Invoices, customers, products, reports", "No access to Admin Panel", "Cannot manage users or view activity"],
    },
  ];

  return (
    <>
    {profileSaving && <OverlayLoader text="Saving profile…" />}
    {pwSaving && <OverlayLoader text="Updating password…" />}
    {addSaving && <OverlayLoader text="Creating user…" />}
    {editSaving && <OverlayLoader text="Saving changes…" />}
    <div className="page-stack">
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete User"
        message={`Delete "${deleteConfirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete" variant="danger" loading={deleteLoading}
        onConfirm={deleteUser} onCancel={() => setDeleteConfirm(null)}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">Profile, user management &amp; activity log</p>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────── */}
      <div className={styles.twoCol}>

        {/* ── Main content ─────────────────────────────────────── */}
        <div className={styles.mainCol}>

      {/* ── My Profile ─────────────────────────────────────────── */}
      <div className="card">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>My Profile</h2>
          {!editingProfile && !profileLoading && (
            <Button variant="secondary" size="sm" onClick={() => { setEditingProfile(true); setChangingPw(false); setProfileMsg(null); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </Button>
          )}
        </div>
        <div className={styles.sectionBody}>
          {profileLoading ? (
            <div className={styles.skRow}>
              {/* Avatar */}
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
          ) : editingProfile ? (
            <form onSubmit={saveProfile} className={styles.formCol}>
              <div className={styles.fg2}>
                <Field label="Full Name"><input className={styles.inp} value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} required /></Field>
                <Field label="Login Email — used to sign in to this app"><input className={styles.inp} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} required /></Field>
              </div>
              {profileMsg && <Msg m={profileMsg} />}
              <div className={styles.formActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setEditingProfile(false); setProfileForm({ name: profile!.name, email: profile!.email }); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={profileSaving}>Save Changes</Button>
              </div>
            </form>
          ) : (
            <div className={styles.profileRow}>
              <div className={styles.avatarWrapRelative}>
                {(() => { const c = AVATAR_COLORS[(profile?.role ?? "staff") as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.staff; return (
                  <>
                    <div className={`${styles.avatarCircle} ${styles.avatarCircleLg}`} style={{ background: c.bg, color: c.text, borderColor: c.badge }}>
                      {profile?.name?.[0]?.toUpperCase()}
                    </div>
                    <div className={styles.avatarBadgeLg} style={{ background: c.badge }}>
                      {c.badgeIcon}
                    </div>
                  </>
                ); })()}
              </div>
              <div className={styles.profileMain}>
                <div className={styles.profileName}>{profile?.name}</div>
                <div className={styles.profileEmail}>
                  {profile?.email}
                  <span className={styles.loginEmailTag}>login email</span>
                </div>
                <div className={styles.profileMetaRow}>
                  <RoleBadge role={profile?.role ?? ""} />
                  <span className={styles.metaText}>Joined {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  <span className={styles.metaText}>· {profile?._count.invoices ?? 0} invoices created</span>
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
            {!changingPw && (
              <Button variant="secondary" size="sm" onClick={() => { setChangingPw(true); setEditingProfile(false); setPwMsg(null); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                Change Password
              </Button>
            )}
          </div>
          {changingPw && (
            <form onSubmit={savePassword} className={styles.pwFormSpacing}>
              <div className={styles.fg3pw}>
                <Field label="Current Password"><input className={styles.inp} type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required placeholder="••••••••" /></Field>
                <Field label="New Password"><input className={styles.inp} type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} required placeholder="min. 8 characters" /></Field>
                <Field label="Confirm Password"><input className={styles.inp} type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} required placeholder="repeat new password" /></Field>
              </div>
              {pwMsg && <Msg m={pwMsg} />}
              <div className={styles.formActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); setPwMsg(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={pwSaving}>Update Password</Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── User Management ────────────────────────────────────── */}
      <div className="card">
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>User Management</h2>
            <p className={styles.sectionSub}>{users.length} user{users.length !== 1 ? "s" : ""} in the system</p>
          </div>
          {!addOpen && (
            <Button variant="primary" size="sm" onClick={() => { setAddOpen(true); setEditUser(null); setAddMsg(null); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add User
            </Button>
          )}
        </div>

        {addOpen && (
          <div className={styles.inlineForm}>
            <div className={styles.inlineFormTitle}>New User</div>
            <form onSubmit={addUser} className={styles.formColTight}>
              <div className={styles.fg4}>
                <Field label="Full Name">
                  <input className={`${styles.inp} ${addFieldErrors.name ? styles.inpError : ""}`} value={addForm.name} onChange={e => handleAddFormChange("name", e.target.value)} required placeholder="Jane Smith" />
                  {addFieldErrors.name && <span className={styles.fieldErr}>{addFieldErrors.name}</span>}
                </Field>
                <Field label="Email">
                  <div className={styles.emailWrap}>
                    <input className={`${styles.inp} ${addFieldErrors.email ? styles.inpError : ""}`} type="email" value={addForm.email} onChange={e => handleAddFormChange("email", e.target.value)} required placeholder="jane@example.com" />
                    {emailCheckLoading && <span className={styles.emailChecking}>checking…</span>}
                  </div>
                  {addFieldErrors.email && <span className={styles.fieldErr}>{addFieldErrors.email}</span>}
                </Field>
                <Field label="Password">
                  <PasswordInput className={styles.inp} value={addForm.password} onChange={e => handleAddFormChange("password", e.target.value)} required placeholder="min. 8 characters" />
                  {addFieldErrors.password && <span className={styles.fieldErr}>{addFieldErrors.password}</span>}
                </Field>
                <Field label="Re-enter Password">
                  <PasswordInput className={styles.inp} value={addForm.confirmPassword} onChange={e => handleAddFormChange("confirmPassword", e.target.value)} required placeholder="repeat password" />
                  {addFieldErrors.confirmPassword && (
                    <span className={styles.fieldErr}>{addFieldErrors.confirmPassword}</span>
                  )}
                  {!addFieldErrors.confirmPassword && addForm.confirmPassword && addForm.password === addForm.confirmPassword && (
                    <span className={styles.fieldOk}>✓ Passwords match</span>
                  )}
                </Field>
                <Field label="Role">
                  <select className={`${styles.inp} ${styles.inpCursor}`} value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value as Role }))}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              </div>
              {addMsg && <Msg m={addMsg} />}
              <div className={styles.formActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setAddOpen(false); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddMsg(null); setAddFieldErrors({}); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={addSaving || !!addFieldErrors.name || !!addFieldErrors.email || !!addFieldErrors.confirmPassword || emailCheckLoading}>Create User</Button>
              </div>
            </form>
          </div>
        )}


        {editUser && (
          <div className={styles.inlineForm}>
            <div className={styles.inlineFormTitle}>Edit: {editUser.name}</div>
            <form onSubmit={saveEdit} className={styles.formCol}>
              <div className={styles.fg3}>
                <Field label="Full Name"><input className={styles.inp} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required /></Field>
                <Field label="Email"><input className={styles.inp} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} required /></Field>
                <Field label="Role">
                  <select className={`${styles.inp} ${styles.inpCursor}`} value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value as Role }))}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              </div>
              <div className={styles.pwSection}>
                <div className={styles.pwSectionHint}>New password — leave blank to keep current</div>
                <div className={styles.maxW20}>
                  <Field label="New Password"><input className={styles.inp} type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="min. 8 characters" /></Field>
                </div>
              </div>
              {editMsg && <Msg m={editMsg} />}
              <div className={styles.formActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setEditUser(null); setEditMsg(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={editSaving}>Save Changes</Button>
              </div>
            </form>
          </div>
        )}


        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th className="table-th-right">Invoices</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div className={styles.skUserCell}>
                        <div className={styles.skAvatarSm} />
                        <div className={styles.skCellCol}>
                          <div className={styles.skLineName} />
                          <div className={styles.skLineEmail} />
                        </div>
                      </div>
                    </td>
                    <td><div className={styles.skRolePill} /></td>
                    <td className="table-td-right"><div className={styles.skNumCell} /></td>
                    <td><div className={styles.skJoinedCell} /></td>
                    <td><div className={styles.skActionsCell} /></td>
                  </tr>
                ))
              ) : users.map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <tr key={u.id} className={editUser?.id === u.id ? styles.rowHighlight : ""}>
                    <td data-mobile-full data-label="User">
                      <div className={styles.userCell}>
                        <UserAvatar name={u.name} role={u.role} isSelf={isSelf} size={32} />
                        <div>
                          <div className={styles.userName}>
                            {u.name}{isSelf && <span className={styles.youTag}>(you)</span>}
                          </div>
                          <div className={styles.userEmail}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role"><RoleBadge role={u.role} /></td>
                    <td data-label="Invoices" className={`table-td-right ${styles.invoicesCell}`}>{u._count.invoices}</td>
                    <td data-label="Joined" className={styles.joinedCell}>
                      {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td data-mobile-full data-label="Actions">
                      {isSelf ? (
                        <span className={styles.selfNote}>Use My Profile above</span>
                      ) : (
                        <div className="table-actions">
                          <Button variant="editOutline" size="sm" onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email, role: u.role as Role, newPassword: "" }); setEditMsg(null); setAddOpen(false); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </Button>
                          <Button variant="dangerOutline" size="sm" onClick={() => setDeleteConfirm(u)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Activity Log ───────────────────────────────────────── */}
      <div className="card">
        <div className={styles.sectionHeaderWrap}>
          <div>
            <h2 className={styles.sectionTitle}>Activity Log</h2>
            <p className={styles.sectionSub}>{logsTotal} total actions recorded</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadLogs(logsPage, logsFilter)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className={styles.filterBar}>
          <input
            className={`${styles.inp} ${styles.inpCompact}`} type="search" aria-label="Search activity log" placeholder="Search actions or details…" value={logsSearch}
            onChange={e => setLogsSearch(e.target.value)}
          />
          <select
            className={`${styles.inp} ${styles.inpAuto} ${styles.inpCursor} ${styles.inpCompact}`}
            value={logsFilter}
            onChange={e => { setLogsFilter(e.target.value); setLogsPage(1); }}
          >
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {(logsSearch || logsFilter) && (
            <button className={styles.clearFiltersBtn} onClick={() => { setLogsSearch(""); setLogsFilter(""); setLogsPage(1); }}>
              Clear filters
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="table-base">
            <colgroup>
              <col className={styles.colUser} />
              <col className={styles.colAction} />
              <col />
              <col className={styles.colTime} />
            </colgroup>
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && logs.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div className={styles.skLogUserCol}>
                        <div className={styles.skLogLine} style={{ width: [90, 110, 80, 100, 95, 105, 88, 115][i % 8] }} />
                        <div className={styles.skLogPill} />
                      </div>
                    </td>
                    <td><div className={styles.skLogActionPill} style={{ width: [100, 120, 95, 130, 108, 118, 100, 125][i % 8] }} /></td>
                    <td><div className={styles.skLogDetails} /></td>
                    <td><div className={styles.skLogTime} /></td>
                  </tr>
                ))
              ) : visibleLogs.length === 0 ? (
                <tr><td colSpan={4} className="table-empty-cell">
                  {logsSearch || logsFilter ? "No matching activity found." : "No activity recorded yet. Actions will appear here as staff use the app."}
                </td></tr>
              ) : visibleLogs.map(log => (
                <tr key={log.id}>
                  <td data-label="User">
                    <div className={styles.logUserCell}>
                      <UserAvatar name={log.user.name} role={log.user.role} size={30} />
                      <div>
                        <div className={styles.logUserName}>{log.user.name}</div>
                        <RoleBadge role={log.user.role} />
                      </div>
                    </div>
                  </td>
                  <td data-label="Action"><ActionBadge action={log.action} /></td>
                  <td data-mobile-full data-label="Details" className={styles.logDetails}>{log.details}</td>
                  <td data-label="Time" className={styles.logTime}>{fmtTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logsTotal > LOGS_LIMIT && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              {logsTotal} total · page {logsPage} of {logsTotalPages}
            </span>
            <div className={styles.paginationBtns}>
              <Button
                variant="secondary" size="sm"
                disabled={logsLoading || logsPage <= 1}
                onClick={() => loadLogs(logsPage - 1, logsFilter)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
                Prev
              </Button>
              <Button
                variant="secondary" size="sm"
                disabled={logsLoading || logsPage >= logsTotalPages}
                onClick={() => loadLogs(logsPage + 1, logsFilter)}
              >
                Next
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
              </Button>
            </div>
          </div>
        )}
      </div>

      </div>{/* end main content column */}

        {/* ── Right sidebar — Role Reference ───────────────────── */}
        <div className={styles.roleSidebar}>
          <div className={styles.roleSidebarLabel}>
            Role Permissions
          </div>
          {ROLE_INFO.map(r => (
            <div key={r.role} className={`card ${styles.roleCard}`}>
              <div className={styles.roleCardHead}>
                {(() => { const c = AVATAR_COLORS[r.role as keyof typeof AVATAR_COLORS]; return (
                  <div className={styles.roleAvatar} style={{ background: c.bg, color: c.text, borderColor: `${c.bg}99` }}>
                    {r.role === "admin" ? "A" : "S"}
                    <span className={styles.roleAvatarBadge} style={{ background: c.badge }}>{c.badgeIcon}</span>
                  </div>
                ); })()}
                <span className={styles.roleName} style={{ color: r.color }}>{r.role}</span>
              </div>
              <ul className={styles.roleList}>
                {r.perms.map(p => (
                  <li key={p} className={styles.roleListItem}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

      </div>{/* end two-col flex */}
    </div>
    </>
  );
}
