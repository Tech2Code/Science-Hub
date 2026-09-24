"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { rules, validate } from "@/lib/validation";
import { Input, Select, FormField } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { useToast } from "@/components/ui/Toast";
import { bustCachePrefix } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import { useScrollToHash } from "@/lib/useScrollToHash";
import { useDirty } from "@/lib/useDirty";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { MyProfileCard } from "@/components/profile/MyProfileCard";
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

type Role = "admin" | "staff" | "manager";

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
  empty_bin:              { label: "Bin Emptied",            color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)" },
  clear_activity_log:     { label: "Activity Log Cleared",   color: "var(--c-red)",         bg: "var(--c-red-bg)",    border: "var(--c-red-border)" },
  manual_stock_adjustment:{ label: "Stock Adjusted",         color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  reassign_invoice:       { label: "Invoice Reassigned",     color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  reassign_purchase_bill: { label: "Bill Reassigned",        color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  reassign_rate_list:     { label: "Rate List Reassigned",   color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
  reassign_user_documents:{ label: "Documents Reassigned",   color: "var(--c-amber)",       bg: "var(--c-amber-bg)",  border: "var(--c-amber-border)" },
};

function ActionBadge({ action }: { action: string }) {
  const m = ACTION_META[action] ?? { label: action, color: "var(--c-text-3)", bg: "var(--c-bg-sub)", border: "var(--c-border)" };
  return (
    <span className={styles.actionBadge} style={{ color: m.color, background: m.bg, borderColor: m.border }}>{m.label}</span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  return (
    <span className={`${styles.roleBadge} ${isAdmin ? styles.roleBadgeAdmin : isManager ? styles.roleBadgeAdmin : styles.roleBadgeStaff}`}>
      {isAdmin ? "⬡ Admin" : isManager ? "◈ Manager" : "◌ Staff"}
    </span>
  );
}

const AVATAR_COLORS = {
  admin: { bg: "#6366f1", text: "#fff", badge: "#f59e0b", badgeIcon: "★" },
  manager: { bg: "#2563eb", text: "#fff", badge: "#6366f1", badgeIcon: "◈" },
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

function Msg({ m }: { m: { type: "ok" | "err"; text: string } }) {
  return (
    <div className={`${styles.msg} ${m.type === "ok" ? styles.msgOk : styles.msgErr}`}>{m.text}</div>
  );
}

const fmtTime = formatDateTime;

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";
  const toast = useToast();
  useScrollToHash(!!session);

  // Redirect non-admins immediately
  useEffect(() => {
    if (session && session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, router]);

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
  const editFormDirty = useDirty(editForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<{ name?: string; email?: string; newPassword?: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Populated when DELETE is blocked because the user has created invoices/purchase bills/rate
  // lists — offers a "reassign everything to another user, then delete" flow instead of just an
  // error, so clearing this block never requires opening each document individually.
  const [reassignDeleteTarget, setReassignDeleteTarget] = useState<User | null>(null);
  const [deleteBlockers, setDeleteBlockers] = useState<{ invoiceCount: number; purchaseBillCount: number; rateListCount: number } | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassigningAndDeleting, setReassigningAndDeleting] = useState(false);

  // ── Activity Log ─────────────────────────────────────────────
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadedOnce, setLogsLoadedOnce] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsFilter, setLogsFilter] = useState(""); // filter by userId
  const [logsSearch, setLogsSearch] = useState(""); // text search
  const [logDeleteConfirm, setLogDeleteConfirm] = useState<ActivityLog | null>(null);
  const [logDeleteLoading, setLogDeleteLoading] = useState(false);
  const [clearLogsConfirm, setClearLogsConfirm] = useState(false);
  const [clearLogsLoading, setClearLogsLoading] = useState(false);
  const [clearLogsInput, setClearLogsInput] = useState("");
  const LOGS_LIMIT = 10;
  const CLEAR_LOGS_PHRASE = "DELETE ALL";

  const loadLogs = useCallback(async (page: number, userId: string, search: string) => {
    setLogsLoading(true);
    const offset = (page - 1) * LOGS_LIMIT;
    const qs = new URLSearchParams({ limit: String(LOGS_LIMIT), offset: String(offset) });
    if (userId) qs.set("userId", userId);
    if (search) qs.set("search", search);
    const res = await fetch(`/api/admin/activity?${qs}`, { headers: { "x-no-loader": "1" } });
    const data = await res.json();
    setLogsLoading(false);
    setLogsLoadedOnce(true);
    if (res.ok) {
      setLogs(data.logs);
      setLogsTotal(data.total);
      setLogsPage(page);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!isAdmin) return; setUsersLoading(true); fetch("/api/admin/users", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setUsers).finally(() => setUsersLoading(false)); }, [isAdmin]);
  // logsSearch intentionally excluded — its own debounced effect below handles search changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin) loadLogs(1, logsFilter, logsSearch.trim()); }, [isAdmin, logsFilter, loadLogs]);
  const logsSearchMountedRef = useRef(false);
  useEffect(() => {
    if (!logsSearchMountedRef.current) { logsSearchMountedRef.current = true; return; }
    if (!isAdmin) return;
    const timer = setTimeout(() => loadLogs(1, logsFilter, logsSearch.trim()), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      const { password: pw, confirmPassword: conf } = updated;
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
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    const nameErr  = validate(addForm.name,            rules.required("Name is required."), rules.minLength(2), rules.maxLength(200));
    const emailErr = validate(addForm.email,           rules.required("Email is required."), rules.maxLength(254), rules.email());
    const pwErr    = validate(addForm.password,        rules.required("Password is required."), rules.minLength(8, "Password must be at least 8 characters."), rules.maxLength(72, "Password must be at most 72 characters."));
    const confErr  = validate(addForm.confirmPassword, rules.required("Please confirm the password."), rules.passwordMatch(addForm.password));
    if (nameErr || emailErr || pwErr || confErr) {
      setAddFieldErrors(prev => ({ ...prev, name: nameErr ?? undefined, email: emailErr ?? undefined, password: pwErr ?? undefined, confirmPassword: confErr ?? undefined }));
      return;
    }
    setAddSaving(true); setAddMsg(null);
    const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
    const data = await res.json(); setAddSaving(false);
    if (!res.ok) {
      const msg: string = data.error ?? "Failed to add user.";
      if (/email/i.test(msg)) setAddFieldErrors(prev => ({ ...prev, email: msg }));
      else if (/name/i.test(msg)) setAddFieldErrors(prev => ({ ...prev, name: msg }));
      else setAddMsg({ type: "err", text: msg });
      return;
    }
    setUsers(prev => [...prev, data]); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddOpen(false); setAddMsg(null); setAddFieldErrors({});
    toast({ type: "success", title: "User created", message: `"${data.name}" added to the system.` });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    const nameErr  = validate(editForm.name,        rules.required("Name is required."), rules.minLength(2), rules.maxLength(200));
    const emailErr = validate(editForm.email,       rules.required("Email is required."), rules.maxLength(254), rules.email());
    const pwErr    = editForm.newPassword ? validate(editForm.newPassword, rules.minLength(8, "New password must be at least 8 characters."), rules.maxLength(72, "New password must be at most 72 characters.")) : null;
    if (nameErr || emailErr || pwErr) { setEditFieldErrors({ name: nameErr ?? undefined, email: emailErr ?? undefined, newPassword: pwErr ?? undefined }); return; }
    setEditFieldErrors({});
    setEditSaving(true); setEditMsg(null);
    const body: Record<string, string> = { name: editForm.name, email: editForm.email, role: editForm.role };
    if (editForm.newPassword) body.newPassword = editForm.newPassword;
    const res = await fetch(`/api/admin/users/${editUser.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); setEditSaving(false);
    if (!res.ok) {
      const msg: string = data.error ?? "Could not update user.";
      if (/email/i.test(msg)) setEditFieldErrors({ email: msg });
      else if (/name/i.test(msg)) setEditFieldErrors({ name: msg });
      else if (/password/i.test(msg)) setEditFieldErrors({ newPassword: msg });
      else setEditMsg({ type: "err", text: msg });
      return;
    }
    setUsers(prev => prev.map(u => u.id === data.id ? data : u)); setEditUser(null); setEditMsg(null); setEditFieldErrors({});
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
      if (!res.ok) {
        // Blocked by attached documents — hand off to the reassign-and-delete flow instead of
        // just showing an error, so this never requires opening each document individually.
        if (data.invoiceCount > 0 || data.purchaseBillCount > 0 || data.rateListCount > 0) {
          setDeleteConfirm(null);
          setReassignDeleteTarget(target);
          setDeleteBlockers({ invoiceCount: data.invoiceCount ?? 0, purchaseBillCount: data.purchaseBillCount ?? 0, rateListCount: data.rateListCount ?? 0 });
          setReassignTargetId("");
          return;
        }
        setDeleteConfirm(null);
        toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete user." });
        return;
      }
      setDeleteConfirm(null);
      setUsers(prev => prev.filter(u => u.id !== target.id));
      toast({ type: "success", title: "User deleted", message: `"${target.name}" removed.` });
    } catch {
      setDeleteLoading(false);
      setDeleteConfirm(null);
      toast({ type: "error", title: "Delete failed", message: "Network error. Please try again." });
    }
  }

  async function reassignAndDelete() {
    if (!reassignDeleteTarget || !reassignTargetId) return;
    const target = reassignDeleteTarget;
    setReassigningAndDeleting(true);
    try {
      const reassignRes = await fetch(`/api/admin/users/${target.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: reassignTargetId }),
      });
      const reassignData = await reassignRes.json().catch(() => ({}));
      if (!reassignRes.ok) {
        setReassigningAndDeleting(false);
        toast({ type: "error", title: "Reassign failed", message: reassignData.error ?? "Could not reassign documents." });
        return;
      }
      const delRes = await fetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
      const delData = await delRes.json().catch(() => ({}));
      setReassigningAndDeleting(false);
      if (!delRes.ok) {
        toast({ type: "error", title: "Delete failed", message: delData.error ?? "Documents were reassigned, but the user could not be deleted." });
        return;
      }
      if (reassignData.invoiceCount > 0) bustCachePrefix("/api/invoices");
      if (reassignData.purchaseBillCount > 0) bustCachePrefix("/api/purchase-bills");
      if (reassignData.rateListCount > 0) bustCachePrefix("/api/rate-lists");
      setUsers(prev => prev.filter(u => u.id !== target.id));
      setReassignDeleteTarget(null);
      setDeleteBlockers(null);
      toast({
        type: "success",
        title: "User deleted",
        message: `Reassigned ${reassignData.invoiceCount ?? 0} invoice(s), ${reassignData.purchaseBillCount ?? 0} purchase bill(s), ${reassignData.rateListCount ?? 0} rate list(s) and removed "${target.name}".`,
      });
    } catch {
      setReassigningAndDeleting(false);
      toast({ type: "error", title: "Failed", message: "Network error. Please try again." });
    }
  }

  async function deleteLog() {
    if (!logDeleteConfirm) return;
    const target = logDeleteConfirm;
    setLogDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/activity/${target.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setLogDeleteLoading(false);
      setLogDeleteConfirm(null);
      if (!res.ok) {
        toast({ type: "error", title: "Delete failed", message: data.error ?? "Could not delete log entry." });
        return;
      }
      setLogs(prev => prev.filter(l => l.id !== target.id));
      setLogsTotal(t => Math.max(0, t - 1));
      toast({ type: "success", title: "Log entry deleted", message: "Removed from activity log." });
    } catch {
      setLogDeleteLoading(false);
      setLogDeleteConfirm(null);
      toast({ type: "error", title: "Delete failed", message: "Network error. Please try again." });
    }
  }

  async function clearAllLogs() {
    if (clearLogsInput !== CLEAR_LOGS_PHRASE) return;
    setClearLogsLoading(true);
    try {
      const res = await fetch("/api/admin/activity", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setClearLogsLoading(false);
      setClearLogsConfirm(false);
      if (!res.ok) {
        toast({ type: "error", title: "Failed", message: data.error ?? "Could not clear activity log." });
        return;
      }
      setLogs([]);
      setLogsTotal(0);
      setLogsPage(1);
      toast({ type: "success", title: "Activity log cleared", message: `${data.deleted ?? 0} log entries removed.` });
    } catch {
      setClearLogsLoading(false);
      setClearLogsConfirm(false);
      toast({ type: "error", title: "Failed", message: "Network error. Please try again." });
    }
  }

  const selfId = session?.user?.id;

  const visibleLogs = logs;

  if (!isAdmin && session) return null; // redirect in effect

  const ROLE_INFO = [
    {
      role: "admin", color: "var(--c-blue)", dotBg: "#f59e0b",
      perms: ["All business features", "Manage users (create / edit / delete)", "Reset any user's password", "View full activity log", "Manage section permissions"],
    },
    {
      role: "manager", color: "var(--c-blue)", dotBg: "#6366f1",
      perms: ["Access granted sections (set by Admin)", "Invoices, customers, products", "No access to Admin Panel"],
    },
    {
      role: "staff", color: "var(--c-text-3)", dotBg: "#94a3b8",
      perms: ["Access granted sections (set by Admin)", "Invoices, customers, products", "No access to Admin Panel", "Cannot manage users or view activity"],
    },
  ];

  return (
    <>
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

      <Modal
        open={!!reassignDeleteTarget}
        title="Reassign & Delete"
        subtitle={reassignDeleteTarget?.name}
        onClose={() => { if (!reassigningAndDeleting) { setReassignDeleteTarget(null); setDeleteBlockers(null); } }}
        variant="fullscreen"
        maxWidth="28rem"
        footer={
          <>
            <Button
              type="button" variant="secondary" disabled={reassigningAndDeleting}
              onClick={() => { setReassignDeleteTarget(null); setDeleteBlockers(null); }}
            >Cancel</Button>
            <Button
              type="button" variant="danger" loading={reassigningAndDeleting}
              disabled={reassigningAndDeleting || !reassignTargetId}
              onClick={reassignAndDelete}
            >Reassign &amp; Delete</Button>
          </>
        }
      >
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--c-text-2)" }}>
          &quot;{reassignDeleteTarget?.name}&quot; has created{" "}
          {[
            deleteBlockers?.invoiceCount ? `${deleteBlockers.invoiceCount} invoice(s)` : null,
            deleteBlockers?.purchaseBillCount ? `${deleteBlockers.purchaseBillCount} purchase bill(s)` : null,
            deleteBlockers?.rateListCount ? `${deleteBlockers.rateListCount} rate list(s)` : null,
          ].filter(Boolean).join(", ")}. Choose another user to reassign all of them to — this user will then be deleted.
        </p>
        <FormField label="Reassign to">
          <Select value={reassignTargetId} onChange={(e) => setReassignTargetId(e.target.value)} disabled={reassigningAndDeleting}>
            <option value="">Select a user…</option>
            {/* Managers are read-only and can't create documents in normal use — excluded as a
                reassign target, same reasoning as ReassignOwnerModal's per-document picker. */}
            {users.filter(u => u.id !== reassignDeleteTarget?.id && u.role !== "manager").map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </Select>
        </FormField>
      </Modal>

      <ConfirmDialog
        open={!!logDeleteConfirm}
        title="Delete Log Entry"
        message="Delete this activity log entry? This cannot be undone."
        confirmLabel="Delete" variant="danger" loading={logDeleteLoading}
        onConfirm={deleteLog} onCancel={() => setLogDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={clearLogsConfirm}
        title="Delete Entire Activity Log"
        message={`Permanently delete all ${logsTotal} activity log entries? This cannot be undone.`}
        confirmLabel="Delete All" variant="danger" loading={clearLogsLoading}
        confirmDisabled={clearLogsInput !== CLEAR_LOGS_PHRASE}
        detail={
          <div className={styles.clearLogsConfirm}>
            <label htmlFor="clear-logs-confirm">
              Type <strong>{CLEAR_LOGS_PHRASE}</strong> to confirm
            </label>
            <Input
              id="clear-logs-confirm"
              type="text"
              autoComplete="off"
              autoFocus
              className={styles.inp}
              value={clearLogsInput}
              onChange={e => setClearLogsInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && clearLogsInput === CLEAR_LOGS_PHRASE) clearAllLogs(); }}
            />
          </div>
        }
        onConfirm={clearAllLogs}
        onCancel={() => { if (!clearLogsLoading) { setClearLogsConfirm(false); setClearLogsInput(""); } }}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-sub">Profile, user management &amp; activity log</p>
        </div>
        <Button variant="secondary" href="/admin/permissions">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Section Permissions
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </Button>
      </div>

      {/* ── Two-column layout ───────────────────────────────────── */}
      <div className={styles.twoCol}>

        {/* ── Main content ─────────────────────────────────────── */}
        <div className={styles.mainCol}>

      {/* ── My Profile ─────────────────────────────────────────── */}
      <MyProfileCard sectionIndex={0} onSaved={(u) => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, name: u.name, email: u.email } : x))} />

      {/* ── User Management ────────────────────────────────────── */}
      <div id="users" {...animateSection(1, "card")}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>User Management</h2>
            <p className={styles.sectionSub}>{users.length} user{users.length !== 1 ? "s" : ""} in the system</p>
          </div>
          <Button variant="primary" onClick={() => { setAddOpen(true); setEditUser(null); setAddMsg(null); setAddFieldErrors({}); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add User
          </Button>
        </div>

        <Modal
          open={addOpen}
          title="New User"
          variant="fullscreen"
          onClose={() => { if (addSaving) return; setAddOpen(false); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddMsg(null); setAddFieldErrors({}); }}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => { setAddOpen(false); setAddForm({ name: "", email: "", password: "", confirmPassword: "", role: "staff" }); setAddMsg(null); setAddFieldErrors({}); }}>Cancel</Button>
              <Button type="submit" form="add-user-form" variant="primary" disabled={addSaving || !!addFieldErrors.name || !!addFieldErrors.email || !!addFieldErrors.password || !!addFieldErrors.confirmPassword || emailCheckLoading}>Create User</Button>
            </>
          }
        >
          <form id="add-user-form" onSubmit={addUser} className={styles.formColTight} noValidate>
            <div className={styles.fg2}>
              <FormField label="Full Name" required error={addFieldErrors.name}>
                <Input className={`${styles.inp} ${addFieldErrors.name ? styles.inpError : ""}`} value={addForm.name} onChange={e => handleAddFormChange("name", e.target.value)} placeholder="Jane Smith" maxLength={200} />
              </FormField>
              <FormField label="Email" required error={addFieldErrors.email}>
                <div className={styles.emailWrap}>
                  <Input className={`${styles.inp} ${addFieldErrors.email ? styles.inpError : ""}`} type="email" value={addForm.email} onChange={e => handleAddFormChange("email", e.target.value)} placeholder="jane@example.com" maxLength={254} />
                  {emailCheckLoading && <span className={styles.emailChecking}>checking…</span>}
                </div>
              </FormField>
              <FormField label="Password" required error={addFieldErrors.password}>
                <PasswordInput className={`${styles.inp} ${addFieldErrors.password ? styles.inpError : ""}`} value={addForm.password} onChange={e => handleAddFormChange("password", e.target.value)} placeholder="min. 8 characters" autoComplete="new-password" maxLength={72} />
              </FormField>
              <FormField
                label="Re-enter Password"
                required
                error={addFieldErrors.confirmPassword}
                hint={!addFieldErrors.confirmPassword && addForm.confirmPassword && addForm.password === addForm.confirmPassword ? "✓ Passwords match" : undefined}
                hintSuccess
              >
                <PasswordInput className={`${styles.inp} ${addFieldErrors.confirmPassword ? styles.inpError : ""}`} value={addForm.confirmPassword} onChange={e => handleAddFormChange("confirmPassword", e.target.value)} placeholder="repeat password" autoComplete="new-password" maxLength={72} />
              </FormField>
              <FormField label="Role">
                <Select className={`${styles.inp} ${styles.inpCursor}`} value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value as Role }))}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </Select>
              </FormField>
            </div>
            {addMsg && <Msg m={addMsg} />}
          </form>
        </Modal>

        <Modal
          open={!!editUser}
          title={`Edit: ${editUser?.name ?? ""}`}
          variant="fullscreen"
          onClose={() => { if (editSaving) return; setEditUser(null); setEditMsg(null); setEditFieldErrors({}); }}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => { setEditUser(null); setEditMsg(null); setEditFieldErrors({}); }}>Cancel</Button>
              <Button type="submit" form="edit-user-form" variant="primary" disabled={editSaving || !editFormDirty.isDirty || !editForm.name.trim() || !editForm.email.trim()}>Save Changes</Button>
            </>
          }
        >
          <form id="edit-user-form" onSubmit={saveEdit} className={styles.formCol} noValidate>
            <div className={styles.fg3}>
              <FormField label="Full Name" required error={editFieldErrors.name}>
                <Input className={`${styles.inp} ${editFieldErrors.name ? styles.inpError : ""}`} value={editForm.name} onChange={e => { setEditForm(p => ({ ...p, name: e.target.value })); setEditFieldErrors(prev => ({ ...prev, name: undefined })); }} maxLength={200} />
              </FormField>
              <FormField label="Email" required error={editFieldErrors.email}>
                <Input className={`${styles.inp} ${editFieldErrors.email ? styles.inpError : ""}`} type="email" value={editForm.email} onChange={e => { setEditForm(p => ({ ...p, email: e.target.value })); setEditFieldErrors(prev => ({ ...prev, email: undefined })); }} maxLength={254} />
              </FormField>
              <FormField label="Role">
                <Select className={`${styles.inp} ${styles.inpCursor}`} value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value as Role }))}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </Select>
              </FormField>
            </div>
            <div className={styles.pwSection}>
              <div className={styles.pwSectionHint}>New password — leave blank to keep current</div>
              <div className={styles.maxW20}>
                <FormField label="New Password" error={editFieldErrors.newPassword}>
                  <Input className={`${styles.inp} ${editFieldErrors.newPassword ? styles.inpError : ""}`} type="password" value={editForm.newPassword} onChange={e => { setEditForm(p => ({ ...p, newPassword: e.target.value })); setEditFieldErrors(prev => ({ ...prev, newPassword: undefined })); }} placeholder="min. 8 characters" autoComplete="new-password" maxLength={72} />
                </FormField>
              </div>
            </div>
            {editMsg && <Msg m={editMsg} />}
          </form>
        </Modal>


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
                    <td data-mobile-full data-label="User">
                      <div className={styles.skUserCell}>
                        <div className={styles.skAvatarSm} />
                        <div className={styles.skCellCol}>
                          <div className={styles.skLineName} />
                          <div className={styles.skLineEmail} />
                        </div>
                      </div>
                    </td>
                    <td data-label="Role"><div className={styles.skRolePill} /></td>
                    <td data-label="Invoices" className="table-td-right"><div className={styles.skNumCell} /></td>
                    <td data-label="Joined"><div className={styles.skJoinedCell} /></td>
                    <td data-mobile-full data-label="Actions"><div className={styles.skActionsCell} /></td>
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
                      {formatDate(u.createdAt)}
                    </td>
                    <td data-mobile-full data-label="Actions">
                      {isSelf ? (
                        <span className={styles.selfNote}>Use My Profile above</span>
                      ) : (
                        <div className="table-actions">
                          <Button variant="editOutline" size="sm" onClick={() => { const initial = { name: u.name, email: u.email, role: u.role as Role, newPassword: "" }; setEditUser(u); setEditForm(initial); editFormDirty.markClean(initial); setEditMsg(null); setEditFieldErrors({}); setAddOpen(false); }}>
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
      <div id="activity-log" {...animateSection(2, "card")}>
        <div className={styles.sectionHeaderWrap}>
          <div>
            <h2 className={styles.sectionTitle}>Activity Log</h2>
            <p className={styles.sectionSub}>
              {logsTotal} total actions recorded · entries older than 30 days are automatically removed (except invoice/purchase bill/credit note activity, which is kept indefinitely)
            </p>
          </div>
          <div className={styles.logsHeaderActions}>
            <Button variant="secondary" size="sm" onClick={() => loadLogs(logsPage, logsFilter, logsSearch.trim())}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Refresh
            </Button>
            {logsTotal > 0 && (
              <Button variant="dangerOutline" size="sm" onClick={() => { setClearLogsInput(""); setClearLogsConfirm(true); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                Delete All
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className={styles.filterBar}>
          <Input
            className={`${styles.inp} ${styles.inpCompact}`} type="search" aria-label="Search activity log" placeholder="Search actions or details…" value={logsSearch}
            onChange={e => setLogsSearch(e.target.value)}
          />
          <div className={styles.filterSelectWrap}>
            <Select
              className={`${styles.inp} ${styles.inpCursor} ${styles.inpCompact}`}
              value={logsFilter}
              onChange={e => { setLogsFilter(e.target.value); setLogsPage(1); }}
            >
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          {(logsSearch || logsFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setLogsSearch(""); setLogsFilter(""); setLogsPage(1); }}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="table-wrap">
          <table className="table-base" style={logsLoading && logsLoadedOnce ? { opacity: 0.5 } : undefined}>
            <colgroup>
              <col className={styles.colUser} />
              <col className={styles.colAction} />
              <col className={styles.colDetails} />
              <col className={styles.colTime} />
              <col className={styles.colLogActions} />
            </colgroup>
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && !logsLoadedOnce ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td data-label="User">
                      <div className={styles.skLogUserCol}>
                        <div className={styles.skLogLine} style={{ width: [90, 110, 80, 100, 95, 105, 88, 115][i % 8] }} />
                        <div className={styles.skLogPill} />
                      </div>
                    </td>
                    <td data-label="Action"><div className={styles.skLogActionPill} style={{ width: [100, 120, 95, 130, 108, 118, 100, 125][i % 8] }} /></td>
                    <td data-mobile-full data-label="Details"><div className={styles.skLogDetails} /></td>
                    <td data-label="Time"><div className={styles.skLogTime} /></td>
                    <td data-label="Actions"></td>
                  </tr>
                ))
              ) : visibleLogs.length === 0 ? (
                <tr><td colSpan={5} className="table-empty-cell">
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
                  <td data-mobile-full data-label="Details" className={styles.logDetails} title={log.details}>
                    <span className={styles.logDetailsText}>{log.details}</span>
                  </td>
                  <td data-label="Time" className={styles.logTime}>{fmtTime(log.createdAt)}</td>
                  <td data-label="Actions">
                    <Button variant="dangerOutline" size="sm" onClick={() => setLogDeleteConfirm(log)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — shared component, same as every other list in the app */}
        <Pagination
          total={logsTotal}
          page={logsPage}
          showAll={false}
          loading={logsLoading && logsLoadedOnce}
          label="log entries"
          onPage={(p) => loadLogs(p, logsFilter, logsSearch.trim())}
        />
      </div>

      </div>{/* end main content column */}

        {/* ── Right sidebar — Role Reference ───────────────────── */}
        <div {...animateSection(3, styles.roleSidebar)}>
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
