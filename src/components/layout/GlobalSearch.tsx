"use client";

import React, { useEffect, useRef, useState } from "react";
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

interface GlobalSearchProps {
  // On mobile the topbar has no room for a full-width input alongside the
  // hamburger/page-title on the left and theme/avatar/sign-out on the
  // right, so below this it collapses to just the search icon — tapping
  // it expands to a full-width overlay input instead of squeezing in place.
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
        // A superseded request (one that lost the abort race, or never got
        // aborted in time but a newer one has since started) must not touch
        // state — otherwise its late-arriving response overwrites the
        // newer, still-in-flight search's results with stale ones.
        if (controller !== abortRef.current) return;
        setGroups(res.ok ? data.groups ?? [] : []);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") setGroups([]);
      } finally {
        // Only the most recent request is allowed to clear `loading` — an
        // aborted older request's finally block used to fire first and flip
        // loading to false while the real (newer) request was still
        // pending, which briefly rendered a false "No results" state.
        if (controller === abortRef.current) setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Aborts a still-in-flight request if the whole search widget unmounts
  // (e.g. navigating away mid-search) rather than letting it resolve into a
  // component that's no longer there.
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
        (document.activeElement as HTMLElement)?.blur();
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
    // Same-page anchor jumps (e.g. already on /settings, searching "bank
    // details") don't remount the target page, so its own hash-scroll
    // effect never re-fires — scroll manually instead of relying on it.
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

  // A fresh result set invalidates whatever position the keyboard cursor was
  // sitting at. Adjusted during render (React's documented pattern for
  // resetting state in response to a prop/derived-value change) rather than
  // in a useEffect, which would cost an extra commit-then-rerun-effect pass.
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
            aria-controls="global-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `global-search-option-${activeIndex}` : undefined}
            placeholder="Search invoices, customers, products, settings…"
            value={query}
            maxLength={100}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              setOpen(true);
              // Set in the same batch as the query change so the very next
              // render already reflects "searching" — otherwise the effect
              // below (which only runs after that render) is what flips
              // `loading` true, leaving one stale frame where groups=[] and
              // loading=false render as a false "No results" flash before
              // the real search even starts.
              setLoading(val.trim().length >= 2);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleInputKeyDown}
            className={styles.input}
          />
          {loading && <span className={styles.spinner} />}
        </div>
      </div>

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
