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
    <span style={{
      display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: "9999px",
      fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap",
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>{m.label}</span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "0.2rem 0.6rem",
      borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600,
      background: isAdmin ? "var(--c-blue-bg)" : "var(--c-bg-sub)",
      color: isAdmin ? "var(--c-blue)" : "var(--c-text-3)",
      border: `1px solid ${isAdmin ? "var(--c-blue-border)" : "var(--c-border)"}`,
    }}>
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
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: c.bg, color: c.text,
        border: isSelf ? `2px solid ${c.badge}` : `1px solid ${c.bg}99`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 700,
      }}>
        {name?.[0]?.toUpperCase()}
      </div>
      {/* Role badge */}
      <div style={{
        position: "absolute", bottom: -2, right: -2,
        width: 13, height: 13, borderRadius: "50%",
        background: c.badge,
        border: "1.5px solid var(--c-bg-card, #fff)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 7, color: "#fff", fontWeight: 900, lineHeight: 1,
      }}>
        {c.badgeIcon}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <label style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.75rem", borderRadius: "var(--c-radius-sm)",
  border: "1px solid var(--c-border-md)", background: "var(--c-bg-card)",
  color: "var(--c-text)", fontSize: "0.875rem", outline: "none",
  fontFamily: "var(--font-sans)", boxSizing: "border-box",
};

function Msg({ m }: { m: { type: "ok" | "err"; text: string } }) {
  return (
    <div style={{
      padding: "0.5rem 0.75rem", borderRadius: "var(--c-radius-sm)", fontSize: "0.8125rem",
      background: m.type === "ok" ? "var(--c-green-bg)" : "var(--c-red-bg)",
      color: m.type === "ok" ? "var(--c-green-text)" : "var(--c-red)",
      border: `1px solid ${m.type === "ok" ? "var(--c-green-border)" : "var(--c-red-border)"}`,
    }}>{m.text}</div>
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
      router.replace("/");
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
    const res = await fetch(`/api/admin/activity?${qs}`);
    const data = await res.json();
    setLogsLoading(false);
    if (res.ok) {
      setLogs(data.logs);
      setLogsTotal(data.total);
      setLogsPage(page);
    }
  }, []);

  useEffect(() => { fetch("/api/admin/profile").then(r => r.json()).then(d => { setProfile(d); setProfileForm({ name: d.name, email: d.email }); }).finally(() => setProfileLoading(false)); }, []);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!isAdmin) return; setUsersLoading(true); fetch("/api/admin/users").then(r => r.json()).then(setUsers).finally(() => setUsersLoading(false)); }, [isAdmin]);
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
    const nextErr = validate(pwForm.next,    rules.required("New password is required."), rules.minLength(6, "Password must be at least 6 characters."));
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
      if (field === "password" && value && value.length < 6) {
        setAddFieldErrors(prev => ({ ...prev, password: "Password must be at least 6 characters." }));
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
    const pwErr    = validate(addForm.password,        rules.required("Password is required."), rules.minLength(6, "Password must be at least 6 characters."));
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
    const pwErr    = editForm.newPassword ? validate(editForm.newPassword, rules.minLength(6, "New password must be at least 6 characters.")) : null;
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
    <div>
      <style>{`
        @media (max-width: 900px) { .admin-two-col { flex-direction: column !important; } .admin-role-sidebar { width: 100% !important; position: static !important; flex-direction: row !important; } }
        @media (max-width: 540px) { .admin-role-sidebar { flex-direction: column !important; } }
        .admin-fg4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0.875rem; }
        .admin-fg3 { display: grid; grid-template-columns: 1fr 1fr 8rem; gap: 0.875rem; }
        .admin-fg3pw { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.875rem; }
        .admin-fg2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media (max-width: 640px) {
          .admin-fg4 { grid-template-columns: 1fr 1fr; }
          .admin-fg3 { grid-template-columns: 1fr 1fr; }
          .admin-fg3pw { grid-template-columns: 1fr; }
          .admin-fg2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 400px) {
          .admin-fg4 { grid-template-columns: 1fr; }
          .admin-fg3 { grid-template-columns: 1fr; }
        }
        .admin-inp:focus { border-color: var(--c-blue) !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
      `}</style>
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
      <div className="admin-two-col" style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>

        {/* ── Main content ─────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* ── My Profile ─────────────────────────────────────────── */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-text)" }}>My Profile</h2>
          {!editingProfile && !profileLoading && (
            <Button variant="secondary" size="sm" onClick={() => { setEditingProfile(true); setChangingPw(false); setProfileMsg(null); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </Button>
          )}
        </div>
        <div style={{ padding: "1.25rem" }}>
          {profileLoading ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem", flexWrap: "wrap" }}>
              {/* Avatar */}
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--c-border)", flexShrink: 0, animation: "skPulse 1.4s ease-in-out infinite" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "0.25rem" }}>
                <div style={{ height: 18, width: 160, borderRadius: 5, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 14, width: 210, borderRadius: 5, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <div style={{ height: 22, width: 70, borderRadius: 99, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                  <div style={{ height: 14, width: 120, borderRadius: 5, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", alignSelf: "center" }} />
                </div>
              </div>
            </div>
          ) : editingProfile ? (
            <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="admin-fg2">
                <Field label="Full Name"><input className="admin-inp" style={inp} value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} required /></Field>
                <Field label="Login Email — used to sign in to this app"><input className="admin-inp" style={inp} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} required /></Field>
              </div>
              {profileMsg && <Msg m={profileMsg} />}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setEditingProfile(false); setProfileForm({ name: profile!.name, email: profile!.email }); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={profileSaving}>Save Changes</Button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                {(() => { const c = AVATAR_COLORS[(profile?.role ?? "staff") as keyof typeof AVATAR_COLORS] ?? AVATAR_COLORS.staff; return (
                  <>
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%",
                      background: c.bg, color: c.text,
                      border: `2px solid ${c.badge}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1.25rem", fontWeight: 700,
                    }}>
                      {profile?.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{
                      position: "absolute", bottom: 0, right: 0,
                      width: 18, height: 18, borderRadius: "50%",
                      background: c.badge, border: "2px solid var(--c-bg-card, #fff)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: "#fff", fontWeight: 900,
                    }}>
                      {c.badgeIcon}
                    </div>
                  </>
                ); })()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--c-text)" }}>{profile?.name}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--c-text-3)", marginTop: "0.125rem" }}>
                  {profile?.email}
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "var(--c-text-4)", fontWeight: 500, background: "var(--c-bg-sub)", border: "1px solid var(--c-border)", borderRadius: 4, padding: "0.1rem 0.4rem" }}>login email</span>
                </div>
                <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <RoleBadge role={profile?.role ?? ""} />
                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>Joined {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>· {profile?._count.invoices ?? 0} invoices created</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--c-border)", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text)" }}>Password</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>Change your login password</div>
            </div>
            {!changingPw && (
              <Button variant="secondary" size="sm" onClick={() => { setChangingPw(true); setEditingProfile(false); setPwMsg(null); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                Change Password
              </Button>
            )}
          </div>
          {changingPw && (
            <form onSubmit={savePassword} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div className="admin-fg3pw">
                <Field label="Current Password"><input className="admin-inp" style={inp} type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required placeholder="••••••••" /></Field>
                <Field label="New Password"><input className="admin-inp" style={inp} type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} required placeholder="min. 6 characters" /></Field>
                <Field label="Confirm Password"><input className="admin-inp" style={inp} type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} required placeholder="repeat new password" /></Field>
              </div>
              {pwMsg && <Msg m={pwMsg} />}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setChangingPw(false); setPwForm({ current: "", next: "", confirm: "" }); setPwMsg(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={pwSaving}>Update Password</Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── User Management ────────────────────────────────────── */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-text)" }}>User Management</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{users.length} user{users.length !== 1 ? "s" : ""} in the system</p>
          </div>
          {!addOpen && (
            <Button variant="primary" size="sm" onClick={() => { setAddOpen(true); setEditUser(null); setAddMsg(null); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add User
            </Button>
          )}
        </div>

        {addOpen && (
          <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text)", marginBottom: "0.875rem" }}>New User</div>
            <form onSubmit={addUser} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div className="admin-fg4">
                <Field label="Full Name">
                  <input className="admin-inp" style={{ ...inp, borderColor: addFieldErrors.name ? "var(--c-red)" : undefined }} value={addForm.name} onChange={e => handleAddFormChange("name", e.target.value)} required placeholder="Jane Smith" />
                  {addFieldErrors.name && <span style={{ fontSize: "0.75rem", color: "var(--c-red)", marginTop: "0.125rem", display: "block" }}>{addFieldErrors.name}</span>}
                </Field>
                <Field label="Email">
                  <div style={{ position: "relative" }}>
                    <input className="admin-inp" style={{ ...inp, borderColor: addFieldErrors.email ? "var(--c-red)" : undefined }} type="email" value={addForm.email} onChange={e => handleAddFormChange("email", e.target.value)} required placeholder="jane@example.com" />
                    {emailCheckLoading && <span style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.7rem", color: "var(--c-text-4)" }}>checking…</span>}
                  </div>
                  {addFieldErrors.email && <span style={{ fontSize: "0.75rem", color: "var(--c-red)", marginTop: "0.125rem", display: "block" }}>{addFieldErrors.email}</span>}
                </Field>
                <Field label="Password">
                  <PasswordInput style={inp as React.CSSProperties} value={addForm.password} onChange={e => handleAddFormChange("password", e.target.value)} required placeholder="min. 6 characters" />
                  {addFieldErrors.password && <span style={{ fontSize: "0.75rem", color: "var(--c-red)", marginTop: "0.125rem", display: "block" }}>{addFieldErrors.password}</span>}
                </Field>
                <Field label="Re-enter Password">
                  <PasswordInput style={inp as React.CSSProperties} value={addForm.confirmPassword} onChange={e => handleAddFormChange("confirmPassword", e.target.value)} required placeholder="repeat password" />
                  {addFieldErrors.confirmPassword && (
                    <span style={{ fontSize: "0.75rem", color: "var(--c-red)", marginTop: "0.125rem", display: "block" }}>{addFieldErrors.confirmPassword}</span>
                  )}
                  {!addFieldErrors.confirmPassword && addForm.confirmPassword && addForm.password === addForm.confirmPassword && (
                    <span style={{ fontSize: "0.75rem", color: "var(--c-green-text)", marginTop: "0.125rem", display: "block" }}>✓ Passwords match</span>
                  )}
                </Field>
                <Field label="Role">
                  <select className="admin-inp" style={{ ...inp, cursor: "pointer" }} value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value as Role }))}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              </div>
              {addMsg && <Msg m={addMsg} />}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setAddOpen(false); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddMsg(null); setAddFieldErrors({}); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={addSaving || !!addFieldErrors.name || !!addFieldErrors.email || !!addFieldErrors.confirmPassword || emailCheckLoading}>Create User</Button>
              </div>
            </form>
          </div>
        )}


        {editUser && (
          <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text)", marginBottom: "0.875rem" }}>Edit: {editUser.name}</div>
            <form onSubmit={saveEdit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="admin-fg3">
                <Field label="Full Name"><input className="admin-inp" style={inp} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required /></Field>
                <Field label="Email"><input className="admin-inp" style={inp} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} required /></Field>
                <Field label="Role">
                  <select className="admin-inp" style={{ ...inp, cursor: "pointer" }} value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value as Role }))}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              </div>
              <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginBottom: "0.5rem" }}>New password — leave blank to keep current</div>
                <div style={{ maxWidth: "20rem" }}>
                  <Field label="New Password"><input className="admin-inp" style={inp} type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="min. 6 characters" /></Field>
                </div>
              </div>
              {editMsg && <Msg m={editMsg} />}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--c-border)", flexShrink: 0, animation: "skPulse 1.4s ease-in-out infinite" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ height: 13, width: 110, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                          <div style={{ height: 11, width: 150, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                        </div>
                      </div>
                    </td>
                    <td><div style={{ height: 22, width: 60, borderRadius: 99, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                    <td className="table-td-right"><div style={{ height: 13, width: 24, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite", marginLeft: "auto" }} /></td>
                    <td><div style={{ height: 13, width: 90, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                    <td><div style={{ height: 28, width: 80, borderRadius: 6, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                  </tr>
                ))
              ) : users.map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <tr key={u.id} style={editUser?.id === u.id ? { background: "var(--c-blue-bg)" } : {}}>
                    <td data-mobile-full data-label="User">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <UserAvatar name={u.name} role={u.role} isSelf={isSelf} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--c-text)", fontSize: "0.875rem" }}>
                            {u.name}{isSelf && <span style={{ marginLeft: "0.375rem", fontSize: "0.7rem", color: "var(--c-text-4)", fontWeight: 400 }}>(you)</span>}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--c-text-4)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role"><RoleBadge role={u.role} /></td>
                    <td data-label="Invoices" className="table-td-right" style={{ color: "var(--c-text-3)" }}>{u._count.invoices}</td>
                    <td data-label="Joined" style={{ color: "var(--c-text-4)", fontSize: "0.8rem" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td data-mobile-full data-label="Actions">
                      {isSelf ? (
                        <span style={{ fontSize: "0.78rem", color: "var(--c-text-4)", fontStyle: "italic" }}>Use My Profile above</span>
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
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-text)" }}>Activity Log</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{logsTotal} total actions recorded</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadLogs(logsPage, logsFilter)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="admin-inp" type="search" placeholder="Search actions or details…" value={logsSearch}
            onChange={e => setLogsSearch(e.target.value)}
            style={{ ...inp, maxWidth: "18rem", padding: "0.375rem 0.75rem" }}
          />
          <select
            className="admin-inp" style={{ ...inp, width: "auto", padding: "0.375rem 0.75rem", cursor: "pointer" }}
            value={logsFilter}
            onChange={e => { setLogsFilter(e.target.value); setLogsPage(1); }}
          >
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {(logsSearch || logsFilter) && (
            <button onClick={() => { setLogsSearch(""); setLogsFilter(""); setLogsPage(1); }} style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", padding: "0.375rem 0" }}>
              Clear filters
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="table-base">
            <colgroup>
              <col style={{ width: "200px" }} />
              <col style={{ width: "160px" }} />
              <col />
              <col style={{ width: "160px" }} />
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
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ height: 13, width: [90, 110, 80, 100, 95, 105, 88, 115][i % 8], borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                        <div style={{ height: 20, width: 52, borderRadius: 99, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
                      </div>
                    </td>
                    <td><div style={{ height: 22, width: [100, 120, 95, 130, 108, 118, 100, 125][i % 8], borderRadius: 99, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                    <td><div style={{ height: 13, width: "80%", borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                    <td><div style={{ height: 13, width: 110, borderRadius: 4, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} /></td>
                  </tr>
                ))
              ) : visibleLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: "2.5rem", color: "var(--c-text-4)" }}>
                  {logsSearch || logsFilter ? "No matching activity found." : "No activity recorded yet. Actions will appear here as staff use the app."}
                </td></tr>
              ) : visibleLogs.map(log => (
                <tr key={log.id}>
                  <td data-label="User">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <UserAvatar name={log.user.name} role={log.user.role} size={30} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--c-text)", lineHeight: 1.3 }}>{log.user.name}</div>
                        <RoleBadge role={log.user.role} />
                      </div>
                    </div>
                  </td>
                  <td data-label="Action"><ActionBadge action={log.action} /></td>
                  <td data-mobile-full data-label="Details" style={{ color: "var(--c-text-2)", fontSize: "0.8125rem" }}>{log.details}</td>
                  <td data-label="Time" style={{ color: "var(--c-text-4)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{fmtTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logsTotal > LOGS_LIMIT && (
          <div style={{
            padding: "0.75rem 1.25rem",
            borderTop: "1px solid var(--c-border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--c-text-4)" }}>
              {logsTotal} total · page {logsPage} of {logsTotalPages}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
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
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

        {/* ── Right sidebar — Role Reference ───────────────────── */}
        <div className="admin-role-sidebar" style={{ width: "220px", flexShrink: 0, position: "sticky", top: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.08em", paddingLeft: "0.25rem" }}>
            Role Permissions
          </div>
          {ROLE_INFO.map(r => (
            <div key={r.role} className="card" style={{ padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                {(() => { const c = AVATAR_COLORS[r.role as keyof typeof AVATAR_COLORS]; return (
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: c.bg, color: c.text,
                    border: `1px solid ${c.bg}99`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.625rem", fontWeight: 900, position: "relative",
                  }}>
                    {r.role === "admin" ? "A" : "S"}
                    <span style={{
                      position: "absolute", bottom: -2, right: -2,
                      width: 10, height: 10, borderRadius: "50%",
                      background: c.badge, border: "1.5px solid var(--c-bg-card, #fff)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 6, color: "#fff", fontWeight: 900,
                    }}>{c.badgeIcon}</span>
                  </div>
                ); })()}
                <span style={{ fontWeight: 700, fontSize: "0.875rem", color: r.color, textTransform: "capitalize" }}>{r.role}</span>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 0.875rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {r.perms.map(p => (
                  <li key={p} style={{ fontSize: "0.775rem", color: "var(--c-text-3)", lineHeight: 1.45 }}>{p}</li>
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
