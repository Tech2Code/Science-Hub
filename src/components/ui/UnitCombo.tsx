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

// Typeable unit field (e.g. "500 GM") with a filtered suggestion dropdown — free text always allowed, dropdown is just a shortcut.
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
