"use client";

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Select.module.css";

interface OptionData {
  value: string;
  label: string;
  disabled?: boolean;
}

// <option> children are often composed of several sibling expressions
// (e.g. `{v.name}{v.company ? \` — ${v.company}\` : ""}`), which React
// represents as an array of children rather than a single string — so the
// label has to be assembled from every string/number leaf, not just read
// off a single-child shortcut.
function labelOf(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("");
}

function parseOptions(children: React.ReactNode): OptionData[] {
  const opts: OptionData[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
    opts.push({ value: String(props.value ?? ""), label: labelOf(props.children), disabled: props.disabled });
  });
  return opts;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  sz?: "sm" | "md";
}

/**
 * Custom-styled dropdown that mirrors a native <select>'s API (same
 * value/onChange/name/children-as-<option> contract every call site
 * already uses) while rendering its own trigger + listbox so every option
 * row can actually be styled. A visually-hidden native <select> underneath
 * stays the real controlled element — commit() drives it through React's
 * native value setter so existing onChange handlers keep receiving a
 * genuine ChangeEvent<HTMLSelectElement>, unchanged.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { sz, className, children, value, onChange, name, id, disabled, required, "aria-label": ariaLabel, ...rest },
  forwardedRef
) {
  const hiddenRef = useRef<HTMLSelectElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${triggerId}-listbox`;

  useEffect(() => setMounted(true), []);
  React.useImperativeHandle(forwardedRef, () => hiddenRef.current as HTMLSelectElement);

  const options = useMemo(() => parseOptions(children), [children]);
  const currentValue = value !== undefined && value !== null ? String(value) : undefined;
  const selectedIndex = options.findIndex((o) => o.value === currentValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function enabledIndexes(): number[] {
    return options.map((_, i) => i).filter((i) => !options[i].disabled);
  }

  function step(from: number, dir: 1 | -1): number {
    const idxs = enabledIndexes();
    if (idxs.length === 0) return -1;
    if (from < 0) return dir === 1 ? idxs[0] : idxs[idxs.length - 1];
    const pos = idxs.indexOf(from);
    if (pos === -1) return dir === 1 ? idxs[0] : idxs[idxs.length - 1];
    const next = pos + dir;
    if (next < 0 || next >= idxs.length) return from;
    return idxs[next];
  }

  function commit(newValue: string) {
    const el = hiddenRef.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, newValue);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function computePosition() {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estHeight = Math.min(options.length * 34 + 8, 280);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estHeight && rect.top > spaceBelow;
    setPos(
      openUp
        ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
        : { top: rect.bottom + 4, left: rect.left, width: rect.width }
    );
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes()[0] ?? -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && listRef.current && !listRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onScrollOrResize(e: Event) {
      // Scrolling inside the open listbox itself (to reach more options)
      // fires a capture-phase "scroll" on the window too — only treat
      // scrolling of the page/an ancestor behind the dropdown as a reason
      // to close it.
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => step(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(enabledIndexes()[0] ?? -1);
        break;
      case "End": {
        const idxs = enabledIndexes();
        e.preventDefault();
        setActiveIndex(idxs[idxs.length - 1] ?? -1);
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0 && !options[activeIndex].disabled) commit(options[activeIndex].value);
        setOpen(false);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          typeaheadRef.current += e.key.toLowerCase();
          if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
          typeaheadTimer.current = setTimeout(() => { typeaheadRef.current = ""; }, 600);
          const idxs = enabledIndexes();
          const startAt = idxs.indexOf(activeIndex);
          const ordered = [...idxs.slice(startAt + 1), ...idxs.slice(0, startAt + 1)];
          const match = ordered.find((i) => options[i].label.toLowerCase().startsWith(typeaheadRef.current));
          if (match !== undefined) setActiveIndex(match);
        }
    }
  }

  const triggerCls = [styles.trigger, sz === "sm" && styles.sm, disabled && styles.disabled, className].filter(Boolean).join(" ");

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        id={triggerId}
        className={triggerCls}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <svg className={styles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {mounted && open && pos && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={styles.listbox}
          style={{ position: "fixed", left: pos.left, width: pos.width, ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }) }}
        >
          {options.map((o, i) => (
            <li
              key={o.value + i}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={o.value === currentValue}
              aria-disabled={o.disabled}
              className={[styles.option, i === activeIndex && styles.active, o.value === currentValue && styles.selected, o.disabled && styles.optionDisabled]
                .filter(Boolean).join(" ")}
              onMouseDown={(e) => {
                e.preventDefault();
                if (o.disabled) return;
                commit(o.value);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>,
        document.body
      )}

      <select
        ref={hiddenRef}
        value={value}
        onChange={onChange}
        name={name}
        disabled={disabled}
        required={required}
        aria-hidden="true"
        tabIndex={-1}
        className={styles.native}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});
