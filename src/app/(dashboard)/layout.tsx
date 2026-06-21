"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import styles from "./layout.module.css";

const NavIcons: Record<string, React.FC<{ className?: string }>> = {
  dashboard: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
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
  reports: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  brands: ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
};

const navItems = [
  { href: "/",           label: "Dashboard", iconKey: "dashboard" },
  { href: "/customers", label: "Customers", iconKey: "customers" },
  { href: "/products",  label: "Products",  iconKey: "products"  },
  { href: "/brands",    label: "Brands",    iconKey: "brands"    },
  { href: "/invoices",  label: "Invoices",  iconKey: "invoices"  },
  { href: "/payments",  label: "Payments",  iconKey: "payments"  },
  { href: "/reports",   label: "Reports",   iconKey: "reports"   },
];

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={styles.toggleTrack}
      style={{ background: isDark ? "#3b82f6" : "#e2e8f0" }}
    >
      <span className={styles.toggleIcons}>
        <svg className={styles.toggleIconSun} style={{ opacity: isDark ? 0 : 0.6 }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
        <svg className={styles.toggleIconMoon} style={{ opacity: isDark ? 0.8 : 0 }} fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </span>
      <span className={[styles.toggleThumb, isDark ? styles.toggleThumbOn : ""].join(" ")}>
        {isDark
          ? <svg style={{ width:"0.875rem",height:"0.875rem",color:"#3b82f6" }} fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
          : <svg style={{ width:"0.875rem",height:"0.875rem",color:"#f59e0b" }} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
        }
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

  // Set initial state based on viewport after mount
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
          <div className={styles.loadingIcon}>⚗️</div>
          <span className={styles.loadingText}>Loading…</span>
        </div>
      </div>
    );
  }
  if (status === "unauthenticated") return null;

  const currentNav = navItems.find((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
  );

  return (
    <div className={styles.shell}>
      {/* Mobile backdrop */}
      {mobile && sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={[styles.sidebar, sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed].join(" ")}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>⚗️</div>
          <div className={styles.logoText}>
            <div className={styles.logoName}>Science Hub</div>
            <div className={styles.logoSub}>Billing &amp; Inventory</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
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
        </nav>

        <div className={styles.userBlock}>
          <div className={styles.userRow}>
            <div className={styles.userAvatar}>
              {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className={styles.userName}>{session?.user?.name ?? "User"}</div>
              <div className={styles.userEmail}>{session?.user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Close menu" : "Open menu"}
              className={styles.collapseBtn}
            >
              {/* Hamburger on mobile, chevron on desktop */}
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
            <div className={styles.userChip}>
              <div className={styles.topbarAvatar}>
                {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className={styles.topbarName}>{session?.user?.name}</span>
            </div>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className={styles.signOutBtn}>
              Sign out
            </button>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
