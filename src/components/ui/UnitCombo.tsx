"use client";

import { useState } from "react";
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

// Typeable text input + filtered suggestion dropdown for a "unit" field
// (e.g. "Nos", "500 GM") — any value can be typed freely, the dropdown is
// just a shortcut. Single shared implementation for every unit field in the
// app (invoice/purchase-bill "Add Custom Item" quick-add, rate-list items)
// so they can't drift into three different unit-picker UIs.
export function UnitCombo({ id, value, onChange, suggestions, placeholder = "e.g. Nos, Kg, Box", sz, className }: UnitComboProps) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter((u) => u.toLowerCase().includes(value.toLowerCase()));

  return (
    <div className={styles.unitCombo}>
      <Input
        id={id}
        sz={sz}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
        className={className}
        maxLength={100}
      />
      {open && filtered.length > 0 && (
        <div className={styles.unitDropdown} onMouseDown={(e) => e.preventDefault()}>
          {filtered.map((u) => (
            <button
              key={u} type="button" className={styles.unitOption}
              onClick={() => { onChange(u); setOpen(false); }}
            >
              {u}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
