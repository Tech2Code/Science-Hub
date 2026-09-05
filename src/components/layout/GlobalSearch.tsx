"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PopoverScrim } from "@/components/ui/PopoverScrim";
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

interface GlobalSearchProps {
  // On mobile the topbar has no room for a full-width input, so this collapses to an icon that expands to a full-width overlay when tapped.
  mobile?: boolean;
}

export function GlobalSearch({ mobile = false }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
        // A superseded request's late-arriving response must not overwrite a newer, still-in-flight search's results.
        if (controller !== abortRef.current) return;
        setGroups(res.ok ? data.groups ?? [] : []);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") setGroups([]);
      } finally {
        // Only the most recent request may clear `loading` — otherwise an aborted older request briefly flashes a false "No results" state.
        if (controller === abortRef.current) setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Aborts a still-in-flight request on unmount (e.g. navigating away mid-search).
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMobileExpanded(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMobileExpanded(false);
        // Deliberately no .blur() here — the standard combobox pattern is Escape closes the
        // listbox but leaves focus in the input, so a keyboard user isn't forced to Tab all the
        // way back into the topbar just to reach the search box again.
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Collapsing back to icon-only on a desktop resize would otherwise leave
  // the expanded overlay's fixed positioning stuck on screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets stale expanded state from a prior mobile session so it doesn't reappear next time `mobile` flips back to true
    if (!mobile) setMobileExpanded(false);
  }, [mobile]);

  useEffect(() => {
    if (mobileExpanded) inputRef.current?.focus();
  }, [mobileExpanded]);

  function goTo(href: string) {
    setOpen(false);
    setMobileExpanded(false);
    setQuery("");
    setGroups([]);
    const [path, hash] = href.split("#");
    // Same-page anchor jumps don't remount the target page, so its hash-scroll effect never re-fires — scroll manually instead.
    if (hash && path === window.location.pathname) {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(href);
  }

  const trimmed = query.trim();
  const showPanel = open && trimmed.length >= 2;
  const flatItems = groups.flatMap((g) => g.items);
  const totalResults = flatItems.length;

  // Reset keyboard cursor position on a fresh result set — done during render (not useEffect) to avoid an extra commit-then-rerun pass.
  const [prevGroups, setPrevGroups] = useState(groups);
  if (groups !== prevGroups) {
    setPrevGroups(groups);
    setActiveIndex(-1);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showPanel || flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = (i + 1) % flatItems.length;
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = (i - 1 + flatItems.length) % flatItems.length;
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      goTo(flatItems[activeIndex].href);
    }
  }

  // Collapsed mobile state: just the icon, no input/panel in the DOM at all.
  if (mobile && !mobileExpanded) {
    return (
      <button
        type="button"
        aria-label="Open search"
        className={styles.mobileTrigger}
        onClick={() => setMobileExpanded(true)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  }

  return (
    <div className={[styles.wrap, mobile && mobileExpanded ? styles.wrapMobileExpanded : ""].join(" ")} ref={wrapRef}>
      <div className={styles.inputWrap}>
        {mobile && mobileExpanded && (
          <button
            type="button"
            aria-label="Close search"
            className={styles.mobileBack}
            onClick={() => { setOpen(false); setMobileExpanded(false); setQuery(""); setGroups([]); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        <div className={styles.inputInner}>
          <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search everything"
            aria-expanded={showPanel}
            aria-controls={showPanel ? "global-search-listbox" : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `global-search-option-${activeIndex}` : undefined}
            placeholder="Search invoices, customers, products, settings…"
            value={query}
            maxLength={100}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              setOpen(true);
              // Set loading in the same batch as the query so this render already reflects "searching" — avoids a stale false "No results" flash.
              setLoading(val.trim().length >= 2);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleInputKeyDown}
            className={styles.input}
          />
          {loading && <span className={styles.spinner} />}
        </div>
      </div>

      {showPanel && <PopoverScrim />}

      {showPanel && (
        <div className={styles.panel} id="global-search-listbox" role="listbox">
          {loading && totalResults === 0 ? (
            <div className={styles.empty}>Searching…</div>
          ) : totalResults === 0 ? (
            <div className={styles.empty}>No results for &ldquo;{trimmed}&rdquo;</div>
          ) : (
            (() => {
              let flatIndex = -1;
              return groups.map((group) => (
                <div key={group.type} className={styles.group}>
                  <div className={styles.groupLabel}>{group.label}</div>
                  {group.items.map((item) => {
                    flatIndex++;
                    const i = flatIndex;
                    return (
                      <button
                        key={item.id}
                        ref={(el) => { itemRefs.current[i] = el; }}
                        id={`global-search-option-${i}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === i}
                        className={[styles.item, activeIndex === i ? styles.itemActive : ""].join(" ")}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => goTo(item.href)}
                      >
                        <span className={styles.itemTitle} title={item.title}>{item.title}</span>
                        {item.subtitle && <span className={styles.itemSubtitle} title={item.subtitle}>{item.subtitle}</span>}
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      )}
    </div>
  );
}
