"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DatePicker.module.css";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISO(s: string | number | readonly string[] | undefined): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  sz?: "sm" | "md";
}

/**
 * Custom calendar dropdown standing in for a native <input type="date">.
 * Same drop-in strategy as Select: a visually-hidden native date input
 * stays the real controlled element, so existing onChange handlers keep
 * getting a genuine ChangeEvent<HTMLInputElement> with an ISO e.target.value,
 * unchanged.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { sz, className, value, onChange, name, id, disabled, required, min, max, placeholder, onClick: _onClick, "aria-label": ariaLabel, ...rest },
  forwardedRef
) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);
  const today = startOfDay(new Date());

  const [viewYear, setViewYear] = useState(() => (selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected ?? today).getMonth());
  const [focusedDate, setFocusedDate] = useState<Date>(() => selected ?? today);

  useEffect(() => setMounted(true), []);
  React.useImperativeHandle(forwardedRef, () => hiddenRef.current as HTMLInputElement);

  function isDisabledDate(d: Date): boolean {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  function commit(d: Date) {
    const el = hiddenRef.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, toISO(d));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clear() {
    const el = hiddenRef.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "");
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveTo(d: Date) {
    setFocusedDate(d);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function openPanel() {
    if (disabled) return;
    const base = selected ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setFocusedDate(base);
    setOpen(true);
  }

  function computePosition() {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estHeight && rect.top > spaceBelow;
    setPos(
      openUp
        ? { bottom: window.innerHeight - rect.top + 4, left: rect.left }
        : { top: rect.bottom + 4, left: rect.left }
    );
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onScrollOrResize(e: Event) {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openPanel();
    }
  }

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); moveTo(addDays(focusedDate, -1)); break;
      case "ArrowRight": e.preventDefault(); moveTo(addDays(focusedDate, 1)); break;
      case "ArrowUp": e.preventDefault(); moveTo(addDays(focusedDate, -7)); break;
      case "ArrowDown": e.preventDefault(); moveTo(addDays(focusedDate, 7)); break;
      case "Home": e.preventDefault(); moveTo(addDays(focusedDate, -focusedDate.getDay())); break;
      case "End": e.preventDefault(); moveTo(addDays(focusedDate, 6 - focusedDate.getDay())); break;
      case "PageUp": e.preventDefault(); moveTo(new Date(focusedDate.getFullYear(), focusedDate.getMonth() - 1, focusedDate.getDate())); break;
      case "PageDown": e.preventDefault(); moveTo(new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, focusedDate.getDate())); break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isDisabledDate(focusedDate)) { commit(focusedDate); setOpen(false); }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewYear, viewMonth]);

  const label = selected ? selected.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const triggerCls = [styles.trigger, sz === "sm" && styles.sm, disabled && styles.disabled, className].filter(Boolean).join(" ");

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={triggerCls}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={styles.value}>
          {label || <span className={styles.placeholder}>{placeholder ?? "dd/mm/yyyy"}</span>}
        </span>
        <svg className={styles.icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose date"
          tabIndex={-1}
          className={styles.panel}
          style={{ position: "fixed", left: pos.left, ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }) }}
          onKeyDown={onPanelKeyDown}
        >
          <div className={styles.panelHeader}>
            <button
              type="button"
              className={styles.navBtn}
              aria-label="Previous month"
              onClick={() => setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className={styles.panelTitle}>{MONTHS[viewMonth]} {viewYear}</div>
            <button
              type="button"
              className={styles.navBtn}
              aria-label="Next month"
              onClick={() => setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
          <div className={styles.weekRow}>
            {WEEKDAYS.map((w) => <div key={w} className={styles.weekday}>{w}</div>)}
          </div>
          <div className={styles.grid}>
            {cells.map((d) => {
              const inMonth = d.getMonth() === viewMonth;
              const dis = isDisabledDate(d);
              return (
                <button
                  type="button"
                  key={toISO(d)}
                  disabled={dis}
                  tabIndex={-1}
                  className={[
                    styles.day,
                    !inMonth && styles.outMonth,
                    sameDay(d, today) && styles.today,
                    sameDay(d, selected) && styles.selected,
                    sameDay(d, focusedDate) && styles.focused,
                    dis && styles.dayDisabled,
                  ].filter(Boolean).join(" ")}
                  onClick={() => { commit(d); setOpen(false); }}
                  onMouseEnter={() => setFocusedDate(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className={styles.panelFooter}>
            <button type="button" className={styles.footerBtn} disabled={isDisabledDate(today)} onClick={() => { commit(today); setOpen(false); }}>
              Today
            </button>
            {!!value && (
              <button type="button" className={styles.footerBtn} onClick={() => { clear(); setOpen(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      <input
        ref={hiddenRef}
        type="date"
        value={value}
        onChange={onChange}
        name={name}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        aria-hidden="true"
        tabIndex={-1}
        className={styles.native}
        {...rest}
      />
    </div>
  );
});
