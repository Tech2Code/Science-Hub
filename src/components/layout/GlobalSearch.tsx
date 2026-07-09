"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./GlobalSearch.module.css";

interface ResultItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface ResultGroup {
  type: string;
  label: string;
  items: ResultItem[];
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale results once the query drops below the minimum length
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          headers: { "x-no-loader": "1" },
        });
        const data = await res.json();
        setGroups(res.ok ? data.groups ?? [] : []);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); (document.activeElement as HTMLElement)?.blur(); }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    setGroups([]);
    router.push(href);
  }

  const trimmed = query.trim();
  const showPanel = open && trimmed.length >= 2;
  const totalResults = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.inputWrap}>
        <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          aria-label="Search everything"
          placeholder="Search invoices, customers, products…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className={styles.input}
        />
        {loading && <span className={styles.spinner} />}
      </div>

      {showPanel && (
        <div className={styles.panel}>
          {loading && totalResults === 0 ? (
            <div className={styles.empty}>Searching…</div>
          ) : totalResults === 0 ? (
            <div className={styles.empty}>No results for &ldquo;{trimmed}&rdquo;</div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className={styles.group}>
                <div className={styles.groupLabel}>{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.item}
                    onClick={() => goTo(item.href)}
                  >
                    <span className={styles.itemTitle}>{item.title}</span>
                    {item.subtitle && <span className={styles.itemSubtitle}>{item.subtitle}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
