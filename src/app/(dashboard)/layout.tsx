"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import styles from "./layout.module.css";

const NavIcons: Record<string, React.FC<{ className?: string }>> = {
  dashboard: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  salesDashboard: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  purchaseDashboard: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  customers: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-5.196-3.796M17 20H7m10 0v-1c0-1.007-.272-1.95-.75-2.75M7 20H2v-1a4 4 0 015.196-3.796M7 20v-1c0-1.007.272-1.95.75-2.75m8.5 0a4 4 0 10-8 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  products: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  ),
  invoices: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  payments: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  paymentsMade: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  reportsSales: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  reportsPurchases: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  admin: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  brands: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  bin: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  vendors: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  purchases: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  settings: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

interface NavItem { href: string; label: string; iconKey: string; adminOnly: boolean; }
interface NavGroup { label: string | null; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/",     label: "Dashboard", iconKey: "dashboard", adminOnly: false },
    ],
  },
  {
    label: "SALES",
    items: [
      { href: "/sales",           label: "Sales Overview",    iconKey: "salesDashboard", adminOnly: false },
      { href: "/sales/customers", label: "Customers",         iconKey: "customers",      adminOnly: false },
      { href: "/sales/invoices",  label: "Invoices",          iconKey: "invoices",       adminOnly: false },
      { href: "/sales/payments",  label: "Payments Received", iconKey: "payments",       adminOnly: false },
    ],
  },
  {
    label: "PURCHASES",
    items: [
      { href: "/purchases",          label: "Purchase Overview", iconKey: "purchaseDashboard", adminOnly: false },
      { href: "/purchases/vendors",  label: "Vendors",           iconKey: "vendors",            adminOnly: false },
      { href: "/purchases/bills",    label: "Purchase Bills",    iconKey: "purchases",          adminOnly: false },
      { href: "/purchases/payments", label: "Payments Made",     iconKey: "paymentsMade",       adminOnly: false },
    ],
  },
  {
    label: "CATALOG",
    items: [
      { href: "/products", label: "Products", iconKey: "products", adminOnly: false },
      { href: "/brands",   label: "Brands",   iconKey: "brands",   adminOnly: false },
    ],
  },
  {
    label: "REPORTS",
    items: [
      { href: "/reports/sales",     label: "Sales Reports",    iconKey: "reportsSales",     adminOnly: false },
      { href: "/reports/purchases", label: "Purchase Reports", iconKey: "reportsPurchases", adminOnly: false },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/admin",    label: "Admin",    iconKey: "admin",    adminOnly: true },
      { href: "/settings", label: "Settings", iconKey: "settings", adminOnly: true },
    ],
  },
];

const allNavItems = NAV_GROUPS.flatMap((g) => g.items);
const BIN_NAV = { href: "/bin", label: "Recycle Bin", iconKey: "bin", adminOnly: false };

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function ThemeToggle() {
  const { toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className={styles.toggleTrack}
    >
      <span className={styles.toggleIcons}>
        <svg className={styles.toggleIconSun} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
        <svg className={styles.toggleIconMoon} fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </span>
      <span className={styles.toggleThumb}>
        <svg className={styles.toggleThumbSun} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
        <svg className={styles.toggleThumbMoon} fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </span>
    </button>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    const check = () => {
      const mob = window.innerWidth < 768;
      setMobile(mob);
      if (!mob) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const handleNavClick = useCallback(() => {
    if (isMobile()) setSidebarOpen(false);
  }, []);

  if (status === "loading") {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingInner}>
          <Image src="/logo.png" alt="Science Hub" width={40} height={40} loading="eager" className={styles.loadingIcon} />
          <span className={styles.loadingText}>Loading…</span>
        </div>
      </div>
    );
  }
  if (status === "unauthenticated") return null;

  const currentNav = [...allNavItems, BIN_NAV].find((n) =>
    n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/")
  );

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "var(--c-text-4)",
    textTransform: "uppercase",
    padding: "0.875rem 1rem 0.25rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    marginTop: "0.25rem",
    display: "block",
  };

  return (
    <div className={styles.shell}>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        variant="danger"
        loading={loggingOut}
        onConfirm={async () => { setLoggingOut(true); await signOut({ callbackUrl: "/login" }); }}
        onCancel={() => { if (!loggingOut) setConfirmSignOut(false); }}
      />
      {mobile && sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={[styles.sidebar, sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed].join(" ")}>
        <div className={styles.sidebarLogo}>
          <Image src="/logo.png" alt="Science Hub" width={36} height={36} loading="eager" className={styles.logoIcon} />
          <div className={styles.logoText}>
            <div className={styles.logoName}>Science Hub</div>
            <div className={styles.logoSub}>Billing &amp; Inventory</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.adminOnly || session?.user?.role === "admin"
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label ?? "__top"}>
                {group.label && sidebarOpen && (
                  <span style={sectionLabelStyle}>{group.label}</span>
                )}
                {visibleItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = NavIcons[item.iconKey];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={!sidebarOpen && !mobile ? item.label : undefined}
                      onClick={handleNavClick}
                      className={[styles.navLink, isActive ? styles.navLinkActive : ""].join(" ")}
                    >
                      <Icon className={styles.navIcon} />
                      <span className={styles.navLabel}>{item.label}</span>
                      {isActive && <span className={styles.navDot} />}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <Link
          href="/bin"
          onClick={handleNavClick}
          title={!sidebarOpen && !mobile ? "Bin" : undefined}
          className={[styles.navLink, pathname.startsWith("/bin") ? styles.navLinkActive : ""].join(" ")}
          style={{ margin: "0 0.5rem 0.375rem" }}
        >
          <NavIcons.bin className={styles.navIcon} />
          <span className={styles.navLabel}>Bin</span>
          {pathname.startsWith("/bin") && <span className={styles.navDot} />}
        </Link>

        <div className={styles.userBlock}>
          <Link href="/admin" onClick={handleNavClick} style={{ textDecoration: "none" }}>
            <div className={styles.userRow} style={{ cursor: "pointer", borderRadius: "0.625rem", padding: "0.25rem", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div className={styles.userAvatar} style={{
                  background: session?.user?.role === "admin" ? "#6366f1" : "#22c55e",
                  color: "#fff",
                  border: `1.5px solid ${session?.user?.role === "admin" ? "#f59e0b" : "#94a3b8"}`,
                }}>
                  {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div style={{
                  position: "absolute", bottom: -1, right: -1,
                  width: 11, height: 11, borderRadius: "50%",
                  background: session?.user?.role === "admin" ? "#f59e0b" : "#94a3b8",
                  border: "1.5px solid var(--c-sidebar)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 6, color: "#fff", fontWeight: 900, lineHeight: 1,
                }}>
                  {session?.user?.role === "admin" ? "★" : "·"}
                </div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={styles.userName}>{session?.user?.name ?? "User"}</div>
                <div className={styles.userEmail}>{session?.user?.email}</div>
              </div>
            </div>
          </Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Close menu" : "Open menu"}
              className={styles.collapseBtn}
            >
              {mobile ? (
                <svg style={{ width:"1.125rem", height:"1.125rem" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {sidebarOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  }
                </svg>
              ) : (
                <svg
                  className={[styles.collapseIcon, !sidebarOpen ? styles.collapseIconFlipped : ""].join(" ")}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              )}
            </button>
            <div className={styles.divider} />
            {currentNav && (() => {
              const Icon = NavIcons[currentNav.iconKey];
              return <Icon className={styles.pageIcon} />;
            })()}
            <span className={styles.pageLabel}>{currentNav?.label ?? "Dashboard"}</span>
          </div>

          <div className={styles.topbarRight}>
            <ThemeToggle />
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <div className={styles.userChip} style={{ cursor: "pointer", borderRadius: "0.5rem", padding: "0.25rem 0.375rem", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg-sub)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div className={styles.topbarAvatar} style={{
                    background: session?.user?.role === "admin" ? "#6366f1" : "#22c55e",
                    color: "#fff",
                    border: `1.5px solid ${session?.user?.role === "admin" ? "#f59e0b" : "#94a3b8"}`,
                  }}>
                    {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                  <div style={{
                    position: "absolute", bottom: -1, right: -1,
                    width: 10, height: 10, borderRadius: "50%",
                    background: session?.user?.role === "admin" ? "#f59e0b" : "#94a3b8",
                    border: "1.5px solid var(--c-bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 5, color: "#fff", fontWeight: 900, lineHeight: 1,
                  }}>
                    {session?.user?.role === "admin" ? "★" : "·"}
                  </div>
                </div>
                <span className={styles.topbarName}>{session?.user?.name}</span>
              </div>
            </Link>
            <button
              onClick={() => setConfirmSignOut(true)}
              className={styles.signOutBtn}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <svg style={{ width: 14, height: 14, animation: "spin 0.7s linear infinite", display: "inline-block" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : "Sign out"}
            </button>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
