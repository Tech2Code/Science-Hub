"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFetch, patchCacheIfPresent, bustCache } from "@/lib/useCache";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useMenuA11y } from "@/lib/useMenuA11y";
import { formatDateTime } from "@/lib/formatDate";
import {
  withoutItem, withItem, withoutItemFlat, withItemFlat,
  type NotificationCategoryKey, type NotificationItem, type NotificationSummary,
} from "@/lib/notificationClient";
import styles from "./NotificationBell.module.css";
import shellStyles from "./DashboardShell.module.css";

const DISMISSED_URL = "/api/notifications/dismissed";
function categoryUrl(key: NotificationCategoryKey) {
  return `/api/notifications/category/${key}`;
}

const CATEGORY_TITLES: Record<NotificationCategoryKey, string> = {
  stock: "Stock Alerts",
  overdueInvoices: "Overdue Invoices",
  overdueBills: "Overdue Purchase Bills",
  overLimitCustomers: "Over Credit Limit",
  binExpiring: "Bin — Expiring Soon",
};

function buildSections(s: NotificationSummary, links: Partial<Record<NotificationCategoryKey, { label: string; href: string }[]>>) {
  const cats: NotificationCategoryKey[] = ["stock", "overdueInvoices", "overdueBills", "overLimitCustomers", "binExpiring"];
  return cats
    .map((key) => {
      const cat = key === "binExpiring" ? s.binExpiring : s[key];
      if (!cat) return null;
      return { key, title: CATEGORY_TITLES[key], count: cat.count, items: cat.items, links: links[key] ?? [] };
    })
    .filter((s): s is { key: NotificationCategoryKey; title: string; count: number; items: NotificationItem[]; links: { label: string; href: string }[] } => s !== null && s.count > 0);
}

// A live "needs attention" dropdown, not a persisted notification log — every section reflects
// current data (fixing the underlying thing makes it disappear on its own). Dismissing an item (or
// "Clear all") is per-user and only lasts 24h — see src/lib/notifications.ts — so an unresolved
// alert quietly resurfaces instead of being hidden forever.
export function NotificationBell() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  // Categories currently expanded to their full ("Show all") item list within the popover, instead
  // of just the top-5 preview.
  const [expanded, setExpanded] = useState<Set<NotificationCategoryKey>>(new Set());
  const popRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Per-item request chain — a dismiss (POST) and a since-clicked undo (DELETE) for the same item
  // must still reach the server in click order, even though (see callDismissApi below) neither one
  // triggers its own background refetch anymore.
  const pendingRef = useRef<Map<string, Promise<unknown>>>(new Map());
  // Guards dismiss/undo/restore against a single tap firing its handler twice — mobile/touch
  // devices can synthesize both a "touchend" and a "click" for the same tap (same recurring
  // pattern as pdfBusyRef elsewhere in this app); without this a duplicate firing would double up
  // the optimistic patch. Cleared shortly after rather than immediately, since the duplicate event
  // lands as a separate dispatch a few ms later, not within the same synchronous call.
  const busyRef = useRef<Set<string>>(new Set());
  function withBusyGuard(key: string, fn: () => void) {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    fn();
    setTimeout(() => busyRef.current.delete(key), 400);
  }
  useMenuA11y(open, () => setOpen(false), popoverRef);

  // Only fetched once the dropdown is actually opened — no point loading the full aggregation for a
  // badge nobody's looked at yet; the badge count alone is worth a lightweight background poll. Both
  // hooks target the exact same URL, so they share one underlying cache entry — a mutate/patch
  // through either instance updates both (the badge keeps working even while the dropdown is closed).
  const { data: summary, loading, mutate, patchData } = useFetch<NotificationSummary>(open ? "/api/notifications" : null);
  const { data: badgeSummary } = useFetch<NotificationSummary>("/api/notifications");
  // Only fetched once the "Dismissed" panel is actually opened — the same lazy-loading rationale
  // as the main summary above.
  const { data: dismissedSummary, loading: dismissedLoading, patchData: patchDismissed } =
    useFetch<NotificationSummary>(open && showDismissed ? "/api/notifications/dismissed" : null);

  // One useFetch per category (fixed, always-called set — not a loop over a variable-length
  // list) backing each section's "Show all" expand; each only actually fetches once its category
  // is in `expanded`.
  const expandStock = useFetch<{ items: NotificationItem[] }>(open && expanded.has("stock") ? categoryUrl("stock") : null);
  const expandOverdueInvoices = useFetch<{ items: NotificationItem[] }>(open && expanded.has("overdueInvoices") ? categoryUrl("overdueInvoices") : null);
  const expandOverdueBills = useFetch<{ items: NotificationItem[] }>(open && expanded.has("overdueBills") ? categoryUrl("overdueBills") : null);
  const expandOverLimitCustomers = useFetch<{ items: NotificationItem[] }>(open && expanded.has("overLimitCustomers") ? categoryUrl("overLimitCustomers") : null);
  const expandBinExpiring = useFetch<{ items: NotificationItem[] }>(open && expanded.has("binExpiring") ? categoryUrl("binExpiring") : null);
  const expandHooks: Record<NotificationCategoryKey, ReturnType<typeof useFetch<{ items: NotificationItem[] }>>> = {
    stock: expandStock,
    overdueInvoices: expandOverdueInvoices,
    overdueBills: expandOverdueBills,
    overLimitCustomers: expandOverLimitCustomers,
    binExpiring: expandBinExpiring,
  };

  function toggleExpand(key: NotificationCategoryKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        bustCache(categoryUrl(key)); // always fresh when expanding — same policy as opening the dropdown
        next.add(key);
      }
      return next;
    });
  }

  const totalCount = badgeSummary
    ? badgeSummary.stock.count + badgeSummary.overdueInvoices.count + badgeSummary.overdueBills.count
      + badgeSummary.overLimitCustomers.count + (badgeSummary.binExpiring?.count ?? 0)
    : 0;

  useEffect(() => {
    if (!open) {
      setShowDismissed(false); // eslint-disable-line react-hooks/set-state-in-effect -- resets the panel so the dropdown always reopens on the active view, not wherever it was left
      setExpanded(new Set()); // same reasoning: reopens collapsed to the top-5 preview, not wherever it was left expanded
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // A click on the "Undo" action inside a dismiss toast lands outside popRef (Toast renders
      // at the ToastProvider root, not inside the popover) — don't treat that as an outside click.
      if (target.closest("[data-toast-container]")) return;
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function callDismissApi(method: "POST" | "DELETE", category: NotificationCategoryKey, entityId: string) {
    // Fire-and-forget on purpose — the UI has already updated optimistically (see handleDismiss/
    // handleUndo below), and that optimistic state already matches exactly what this call is
    // telling the server to do, so there's no need to reconcile with a follow-up mutate()/refetch —
    // that used to be the source of a visible flicker: a dismiss's own refetch could land *after*
    // a since-clicked undo and momentarily republish the server's still-"dismissed" state (since
    // the undo's DELETE hadn't reached the server yet), making the item vanish and then reappear
    // once the undo's own refetch caught up. Only the request itself is chained (so a dismiss and a
    // fast undo still hit the server in click order); no read-back afterward.
    const prior = pendingRef.current.get(entityId) ?? Promise.resolve();
    const next = prior.then(() =>
      fetch("/api/notifications/dismiss", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, entityId }),
      }).catch(() => {})
    );
    pendingRef.current.set(entityId, next);
    return next;
  }

  function handleDismiss(category: NotificationCategoryKey, item: NotificationItem) {
    patchData((prev) => (prev ? withoutItem(prev, category, item) : prev as unknown as NotificationSummary));
    // Also reflects instantly in the "Dismissed" panel's own cache (if it's already been loaded
    // this session) — that panel is fetched from a separate URL, so without this it'd keep showing
    // whatever it last fetched until the panel happened to remount/refetch. item.sortKey puts it
    // at its correct position there too, not just at the top.
    patchCacheIfPresent<NotificationSummary>(DISMISSED_URL, (prev) => withItem(prev, category, item));
    // And this category's "Show all" expand cache, if it's been loaded — a dismiss triggered from
    // inside the expanded list must remove it from there too, not just the top-5 preview.
    patchCacheIfPresent<{ items: NotificationItem[] }>(categoryUrl(category), (prev) => ({ items: withoutItemFlat(prev.items, item.id) }));
    toast({
      type: "info",
      title: "Notification dismissed",
      message: `"${item.label}" won't show again today — it'll reappear tomorrow if still unresolved.`,
      actionLabel: "Undo",
      onAction: () => withBusyGuard(`undo:${category}:${item.id}`, () => handleUndo(category, item)),
    });
    callDismissApi("POST", category, item.id);
  }

  function handleUndo(category: NotificationCategoryKey, item: NotificationItem) {
    patchData((prev) => (prev ? withItem(prev, category, item) : prev as unknown as NotificationSummary));
    patchCacheIfPresent<NotificationSummary>(DISMISSED_URL, (prev) => withoutItem(prev, category, item));
    patchCacheIfPresent<{ items: NotificationItem[] }>(categoryUrl(category), (prev) => ({ items: withItemFlat(prev.items, item) }));
    callDismissApi("DELETE", category, item.id);
  }

  // If the "Dismissed" panel's cache is already warm, patchCacheIfPresent (see handleDismiss/
  // handleUndo) keeps it in sync instantly and this is a no-op wait. The first time it's opened,
  // though, there's nothing cached yet, so it does a real fetch — and if that fires before an
  // item just dismissed a moment ago has actually reached the server (a real risk on this app's
  // Neon connection, which can have multi-second cold-start latency — see Known Issues), the panel
  // would open showing that item as still missing. Waiting for every currently in-flight
  // dismiss/undo/restore request to land first avoids that.
  async function openDismissedPanel() {
    await Promise.all(pendingRef.current.values());
    bustCache(DISMISSED_URL); // same "always fresh on open" policy as the main dropdown above
    setShowDismissed(true);
  }

  // Restoring from the "Dismissed" panel — same server call as Undo (removes the dismissal row).
  // item.sortKey (the server's own ascending sort key for this category — due date, stock level,
  // etc., set on both the active and dismissed summaries) puts it back at its true position in the
  // active list immediately, same as Undo — no refetch needed just to learn where it belongs.
  function handleRestore(category: NotificationCategoryKey, item: NotificationItem) {
    patchDismissed((prev) => (prev ? withoutItem(prev, category, item) : prev as unknown as NotificationSummary));
    patchData((prev) => (prev ? withItem(prev, category, item) : prev as unknown as NotificationSummary));
    patchCacheIfPresent<{ items: NotificationItem[] }>(categoryUrl(category), (prev) => ({ items: withItemFlat(prev.items, item) }));
    callDismissApi("DELETE", category, item.id);
    toast({ type: "success", title: "Notification restored", message: `"${item.label}" will show in your notifications again.` });
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      await fetch("/api/notifications/clear-all", { method: "POST" });
    } finally {
      setClearing(false);
      setConfirmClearOpen(false);
      mutate();
      // Every currently-active item just got dismissed server-side — rather than hand-build the
      // resulting dismissed list optimistically, just drop the cached one so the next time the
      // "Dismissed" panel is opened it does a real fetch instead of showing a stale/partial list.
      bustCache(DISMISSED_URL);
    }
  }

  const sections = summary ? buildSections(summary, {
    stock: [
      summary.stock.outOfStockCount > 0 ? { label: `Out of stock (${summary.stock.outOfStockCount})`, href: "/products?filter=out" } : null,
      summary.stock.lowStockCount > 0 ? { label: `Low stock (${summary.stock.lowStockCount})`, href: "/products?filter=low" } : null,
    ].filter((l): l is { label: string; href: string } => l !== null),
    overdueInvoices: summary.overdueInvoices.count > 0 ? [{ label: "View All Overdue Invoices", href: "/sales/invoices?filter=overdue" }] : [],
    overdueBills: summary.overdueBills.count > 0 ? [{ label: "View All Overdue Bills", href: "/purchases/bills?filter=overdue" }] : [],
    overLimitCustomers: summary.overLimitCustomers.count > 0 ? [{ label: "View all customers", href: "/sales/customers" }] : [],
    binExpiring: summary.binExpiring && summary.binExpiring.count > 0 ? [{ label: "Open Recycle Bin", href: "/bin" }] : [],
  }) : [];

  const dismissedSections = dismissedSummary ? buildSections(dismissedSummary, {}) : [];

  // Plain render helpers (not JSX component types) called directly inside .map() — defining an
  // actual <Component/> in here would get a fresh identity every render and force React to
  // remount it instead of reconciling by key.
  function renderDismissRow(category: NotificationCategoryKey, item: NotificationItem) {
    return (
      <div key={item.id} className={styles.itemRow}>
        <Link href={item.href} className={styles.item} onClick={() => setOpen(false)}>
          <span className={styles.itemName} title={item.label}>
            <span className={item.severity === "critical" ? styles.dotCritical : styles.dotWarning} aria-hidden="true" />
            <span className={styles.itemNameText}>{item.label}</span>
          </span>
          <span className={item.severity === "critical" ? styles.itemDetailCritical : styles.itemDetailWarning}>{item.detail}</span>
          <span className={styles.itemTimestamp}>{formatDateTime(item.timestamp)}</span>
        </Link>
        <button
          type="button"
          className={styles.dismissBtn}
          aria-label={`Dismiss ${item.label}`}
          title="Dismiss"
          onClick={() => withBusyGuard(`dismiss:${category}:${item.id}`, () => handleDismiss(category, item))}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    );
  }

  function renderRestoreRow(category: NotificationCategoryKey, item: NotificationItem) {
    return (
      <div key={item.id} className={styles.itemRow}>
        <Link href={item.href} className={styles.item} onClick={() => setOpen(false)}>
          <span className={styles.itemName} title={item.label}>
            <span className={item.severity === "critical" ? styles.dotCritical : styles.dotWarning} aria-hidden="true" />
            <span className={styles.itemNameText}>{item.label}</span>
          </span>
          <span className={item.severity === "critical" ? styles.itemDetailCritical : styles.itemDetailWarning}>{item.detail}</span>
          <span className={styles.itemTimestamp}>{formatDateTime(item.timestamp)}</span>
        </Link>
        <button
          type="button"
          className={styles.restoreBtn}
          onClick={() => withBusyGuard(`restore:${category}:${item.id}`, () => handleRestore(category, item))}
        >
          Restore
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap} ref={popRef}>
      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all notifications?"
        message="This clears every alert currently shown here for you. Anything still unresolved (e.g. an invoice still overdue) will reappear tomorrow."
        confirmLabel="Clear All"
        variant="danger"
        loading={clearing}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <button
        onClick={() => setOpen((v) => {
          const next = !v;
          // No mutation route in the app busts this cache (invoice payments, stock adjustments,
          // etc. don't know or care that a notification badge exists) — so without this, opening
          // the dropdown could show a summary that's stale relative to anything that happened on
          // another page since it was last fetched. Busting right before it opens guarantees a
          // real fetch happens instead of reusing whatever's cached; the fetch's own publish()
          // also refreshes the badge count (badgeSummary shares this exact cache key).
          if (next) bustCache("/api/notifications");
          return next;
        })}
        aria-label={totalCount > 0 ? `Notifications (${totalCount})` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        className={shellStyles.collapseBtn}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "1rem", height: "1rem" }} aria-hidden="true">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {totalCount > 0 && <span className={styles.badge}>{totalCount > 99 ? "99+" : totalCount}</span>}
      </button>

      {open && (
        <div className={styles.popover} ref={popoverRef} role="dialog" aria-label="Notifications" tabIndex={-1}>
          <div className={styles.popoverTitle}>
            {showDismissed ? (
              <button type="button" className={styles.backBtn} onClick={() => setShowDismissed(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
                Dismissed
              </button>
            ) : (
              <>
                <span>Notifications</span>
                <div className={styles.popoverTitleActions}>
                  <button type="button" className={styles.dismissedBtn} onClick={() => openDismissedPanel()}>Dismissed</button>
                  {sections.length > 0 && (
                    <button type="button" className={styles.clearAllBtn} onClick={() => setConfirmClearOpen(true)}>Clear all</button>
                  )}
                </div>
              </>
            )}
          </div>

          {showDismissed ? (
            dismissedLoading && !dismissedSummary ? (
              <div className={styles.emptyState}>Loading…</div>
            ) : dismissedSections.length === 0 ? (
              <div className={styles.emptyState}>Nothing dismissed right now.</div>
            ) : (
              <div className={styles.sectionList}>
                {dismissedSections.map((section) => (
                  <div key={section.key} className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionTitle}>{section.title}</span>
                      <span className={styles.sectionCount}>{section.count}</span>
                    </div>
                    <div className={styles.list}>
                      {section.items.map((item) => renderRestoreRow(section.key, item))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : loading && !summary ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : sections.length === 0 ? (
            <div className={styles.emptyState}>You&apos;re all caught up.</div>
          ) : (
            <div className={styles.sectionList}>
              {sections.map((section) => {
                const isExpanded = expanded.has(section.key);
                const expandState = expandHooks[section.key];
                // section.items is always the top-5 (server-capped) preview regardless of expand
                // state, so this stays a reliable "is there more than what's shown" check.
                const canExpand = section.count > section.items.length;
                const visibleItems = isExpanded ? (expandState.data?.items ?? []) : section.items;
                return (
                  <div key={section.key} className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionTitle}>{section.title}</span>
                      <span className={styles.sectionCount}>{section.count}</span>
                    </div>
                    <div className={styles.list}>
                      {isExpanded && expandState.loading && !expandState.data ? (
                        <div className={styles.emptyState}>Loading…</div>
                      ) : (
                        visibleItems.map((item) => renderDismissRow(section.key, item))
                      )}
                    </div>
                    {(canExpand || section.links.length > 0) && (
                      <div className={styles.sectionFooter}>
                        {canExpand && (
                          <button type="button" className={styles.footerLink} onClick={() => toggleExpand(section.key)}>
                            {isExpanded ? "Show less" : `Show all (${section.count})`}
                          </button>
                        )}
                        {section.links.map((l) => (
                          <Link key={l.href} href={l.href} className={styles.footerLink} onClick={() => setOpen(false)}>{l.label}</Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
