"use client";

import { useState, useEffect, useCallback } from "react";
import { PROTECTED_SECTIONS, SECTION_LABELS, ProtectedSection } from "@/lib/sections";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import styles from "./permissions.module.css";

interface UserPermission {
  section: string;
  enabled: boolean;
}

interface GrantableUser {
  id: string;
  name: string;
  email: string;
  role: string;
  sectionPermissions: UserPermission[];
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow}>
      <td className={styles.tdUser}>
        <div className={styles.skeletonName} />
        <div className={styles.skeletonEmail} />
      </td>
      {PROTECTED_SECTIONS.map((s) => (
        <td key={s} className={styles.tdToggle}>
          <div className={styles.skeletonToggle} />
        </td>
      ))}
      <td className={styles.tdToggle}>
        <div className={styles.skeletonToggle} />
      </td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardHeader}>
        <div className={styles.skeletonName} />
        <div className={styles.skeletonEmail} />
      </div>
      <div className={styles.mobileCardBody}>
        {PROTECTED_SECTIONS.map((s) => (
          <div key={s} className={styles.mobileRow}>
            <div className={styles.skeletonLabel} />
            <div className={styles.skeletonToggle} />
          </div>
        ))}
        <div className={styles.mobileRow}>
          <div className={styles.skeletonLabel} />
          <div className={styles.skeletonToggle} />
        </div>
      </div>
    </div>
  );
}

export function PermissionManager() {
  const [users, setUsers] = useState<GrantableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const toast = useToast();

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/permissions", { headers: { "x-no-loader": "1" } });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchUsers sets loading/users/error state
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const isEnabled = (user: GrantableUser, section: string) =>
    user.sectionPermissions.some((p) => p.section === section && p.enabled);

  // GST Reports has no section of its own — this toggle sets both reports_sales/reports_purchases, which requireGstFilingAccess() actually checks.
  const isGstEnabled = (user: GrantableUser) =>
    isEnabled(user, "reports_sales") && isEnabled(user, "reports_purchases");

  const isGstToggling = (userId: string) =>
    togglingIds.has(`${userId}:reports_sales`) || togglingIds.has(`${userId}:reports_purchases`);

  const handleGstToggle = (user: GrantableUser) => {
    const target = !isGstEnabled(user);
    const salesEnabled = isEnabled(user, "reports_sales");
    const purchasesEnabled = isEnabled(user, "reports_purchases");
    if (salesEnabled !== target) handleToggle(user.id, "reports_sales", salesEnabled);
    if (purchasesEnabled !== target) handleToggle(user.id, "reports_purchases", purchasesEnabled);
  };

  const handleToggle = async (userId: string, section: ProtectedSection, currentEnabled: boolean) => {
    const toggleKey = `${userId}:${section}`;
    if (togglingIds.has(toggleKey)) return;

    const newEnabled = !currentEnabled;
    setTogglingIds((prev) => new Set(prev).add(toggleKey));

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const existing = u.sectionPermissions.find((p) => p.section === section);
        if (existing) {
          return { ...u, sectionPermissions: u.sectionPermissions.map((p) => p.section === section ? { ...p, enabled: newEnabled } : p) };
        }
        return { ...u, sectionPermissions: [...u.sectionPermissions, { section, enabled: newEnabled }] };
      })
    );

    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, section, enabled: newEnabled }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to update"); }
      toast({ type: "success", title: "Permission updated", message: "Permission updated successfully" });
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          return { ...u, sectionPermissions: u.sectionPermissions.map((p) => p.section === section ? { ...p, enabled: currentEnabled } : p) };
        })
      );
      toast({ type: "error", title: "Update failed", message: err instanceof Error ? err.message : "Failed to update permission" });
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(toggleKey); return next; });
    }
  };

  const roles = Array.from(new Set(users.map((u) => u.role))).sort();

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Section Permissions</h1>
        <p className={styles.subtitle}>Control which sections each user can access</p>
      </div>

      {error ? (
        <div className={styles.error}>{error}</div>
      ) : loading ? (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thUser}>User</th>
                  {PROTECTED_SECTIONS.map((s) => (
                    <th key={s} className={styles.thSection}>{SECTION_LABELS[s]}</th>
                  ))}
                  <th className={styles.thSection}>GST Reports</th>
                </tr>
              </thead>
              <tbody>
                <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
              </tbody>
            </table>
          </div>
          <div className={styles.mobileCards}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </>
      ) : users.length === 0 ? (
        <div className={styles.emptyState}>
          No users found. Create users with &quot;staff&quot; or &quot;manager&quot; role to manage their permissions here.
        </div>
      ) : (
        <>
          {/* Search and filter toolbar */}
          <div className={styles.toolbar}>
            <input
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
              aria-label="Search users"
            />
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={styles.roleTrigger}
              wrapClassName={styles.roleWrap}
              aria-label="Filter by role"
            >
              <option value="all">All Roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </Select>
          </div>

          {filteredUsers.length === 0 ? (
            <div className={styles.emptyState}>No users match your search.</div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thUser}>User</th>
                      {PROTECTED_SECTIONS.map((s) => (
                        <th key={s} className={styles.thSection}>{SECTION_LABELS[s]}</th>
                      ))}
                      <th className={styles.thSection} title="Requires both Sales Reports and Purchase Reports — toggling this sets both at once">GST Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const gstEnabled = isGstEnabled(user);
                      const gstToggling = isGstToggling(user.id);
                      return (
                        <tr key={user.id}>
                          <td className={styles.tdUser}>
                            <div className={styles.userName}>{user.name}</div>
                            <div className={styles.userEmail}>{user.email}</div>
                            <div className={styles.userRole}>{user.role}</div>
                          </td>
                          {PROTECTED_SECTIONS.map((section) => {
                            const enabled = isEnabled(user, section);
                            const toggleKey = `${user.id}:${section}`;
                            return (
                              <td key={section} className={styles.tdToggle}>
                                <Switch
                                  checked={enabled}
                                  onChange={() => handleToggle(user.id, section, enabled)}
                                  disabled={togglingIds.has(toggleKey)}
                                  aria-label={`${enabled ? "Disable" : "Enable"} ${SECTION_LABELS[section]} for ${user.name}`}
                                  title={`${enabled ? "Disable" : "Enable"} ${SECTION_LABELS[section]}`}
                                />
                              </td>
                            );
                          })}
                          <td className={styles.tdToggle}>
                            <Switch
                              checked={gstEnabled}
                              onChange={() => handleGstToggle(user)}
                              disabled={gstToggling}
                              aria-label={`${gstEnabled ? "Disable" : "Enable"} GST Reports for ${user.name}`}
                              title={`${gstEnabled ? "Disable" : "Enable"} GST Reports (sets Sales Reports + Purchase Reports together)`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className={styles.mobileCards}>
                {filteredUsers.map((user) => (
                  <div key={user.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardHeader}>
                      <div className={styles.userName}>{user.name}</div>
                      <div className={styles.userEmail}>{user.email}</div>
                      <div className={styles.userRole}>{user.role}</div>
                    </div>
                    <div className={styles.mobileCardBody}>
                      {PROTECTED_SECTIONS.map((section) => {
                        const enabled = isEnabled(user, section);
                        const toggleKey = `${user.id}:${section}`;
                        return (
                          <div key={section} className={styles.mobileRow}>
                            <span className={styles.mobileLabel}>{SECTION_LABELS[section]}</span>
                            <Switch
                              checked={enabled}
                              onChange={() => handleToggle(user.id, section, enabled)}
                              disabled={togglingIds.has(toggleKey)}
                              aria-label={`${enabled ? "Disable" : "Enable"} ${SECTION_LABELS[section]} for ${user.name}`}
                            />
                          </div>
                        );
                      })}
                      <div className={styles.mobileRow}>
                        <span className={styles.mobileLabel}>GST Reports</span>
                        <Switch
                          checked={isGstEnabled(user)}
                          onChange={() => handleGstToggle(user)}
                          disabled={isGstToggling(user.id)}
                          aria-label={`${isGstEnabled(user) ? "Disable" : "Enable"} GST Reports for ${user.name}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
