"use client";

import { useRef, useState } from "react";
import { FloatingSpinner, OverlayLoader } from "./Spinner";
import { ArrowIcon } from "./ArrowIcon";
import styles from "./Pagination.module.css";

export const PAGE_SIZE = 10;

export function usePagination<T>(items: T[], page: number, showAll: boolean) {
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const visible = showAll
    ? items
    : items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { visible, totalPages };
}

interface ToggleProps {
  total: number;
  showAll: boolean;
  onToggle: () => void;
}

export function ShowAllToggle({ total, showAll, onToggle }: ToggleProps) {
  if (total <= PAGE_SIZE) return null;
  return (
    <button
      className={[styles.btn, showAll ? styles.showAllActive : styles.showAll].join(" ")}
      onClick={onToggle}
    >
      {showAll ? "Show less" : "Show all"}
    </button>
  );
}

interface Props {
  total: number;
  page: number;
  showAll: boolean;
  onPage: (p: number) => void;
  label?: string;
  loading?: boolean;
}

export function Pagination({ total, page, showAll, onPage, label = "items", loading = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Tracks whether the in-flight refetch was actually caused by a Prev/Next click here, so page-navigation
  // gets a full-page block (the user must see the new page settle before doing anything else) while other
  // triggers of the same `loading` prop (search/sort/filter typing) keep their existing lighter table-dim behavior.
  const [navigating, setNavigating] = useState(false);
  // Derived from the `loading` prop during render (React's documented pattern) rather than in an
  // effect — `navigating` only ever needs to clear back to false once loading finishes.
  if (!loading && navigating) setNavigating(false);
  // Spinner renders even without pagination controls, so a short single-page list still gets refetch loading feedback.
  if (total <= PAGE_SIZE || showAll) return loading ? <FloatingSpinner /> : null;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const goToPage = (p: number, e: React.MouseEvent<HTMLButtonElement>) => {
    // Blur before the button becomes `disabled` — the browser's own focus-yank on a disabled focused element otherwise fights the smooth scrollIntoView below.
    e.currentTarget.blur();
    setNavigating(true);
    onPage(p);
    const section = wrapRef.current?.closest(".animate-card") ?? wrapRef.current;
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
    {loading && (navigating ? <OverlayLoader text="Loading…" /> : <FloatingSpinner />)}
    <div className={styles.wrap} ref={wrapRef}>
      <span className={styles.info}>{start}–{end} of {total} {label}</span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={(e) => goToPage(page - 1, e)}
          disabled={page <= 1 || loading}
        >
          <ArrowIcon className={styles.prevIcon} /> Prev
        </button>
        <span className={styles.pages}>{page} / {totalPages}</span>
        <button
          className={styles.btn}
          onClick={(e) => goToPage(page + 1, e)}
          disabled={page >= totalPages || loading}
        >
          Next <ArrowIcon />
        </button>
      </div>
    </div>
    </>
  );
}
