"use client";

import { useId, useState } from "react";
import { Input } from "./Input";
import styles from "./UnitCombo.module.css";

interface UnitComboProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  sz?: "sm" | "md";
  className?: string;
}

// Typeable unit field (e.g. "500 GM") with a filtered suggestion dropdown — free text always allowed, dropdown is just a shortcut.
export function UnitCombo({ id, value, onChange, suggestions, placeholder = "e.g. Nos, Kg, Box", sz, className }: UnitComboProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const filtered = suggestions.filter((u) => u.toLowerCase().includes(value.toLowerCase()));

  function select(u: string) {
    onChange(u);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); setActiveIndex(0); return; }
      if (filtered.length) setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length) setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        select(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) { setOpen(false); setActiveIndex(-1); e.currentTarget.blur(); }
    }
  }

  return (
    <div className={styles.unitCombo}>
      <Input
        id={id}
        sz={sz}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1); }, 150)}
        onKeyDown={onKeyDown}
        className={className}
        maxLength={100}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
      />
      {open && filtered.length > 0 && (
        <div id={listboxId} role="listbox" className={styles.unitDropdown} onMouseDown={(e) => e.preventDefault()}>
          {filtered.map((u, i) => (
            <button
              key={u}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              type="button"
              className={[styles.unitOption, i === activeIndex && styles.unitOptionActive].filter(Boolean).join(" ")}
              onClick={() => select(u)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {u}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
