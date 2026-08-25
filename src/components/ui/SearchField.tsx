"use client";

import type { InputHTMLAttributes } from "react";
import { Input } from "./Input";
import shared from "./ToolbarField.module.css";
import styles from "./SearchField.module.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function SearchField({ label = "Search", className, ...props }: Props) {
  return (
    <label className={`${shared.wrap} ${styles.grow}`}>
      <span className={shared.label}>{label}</span>
      <Input type="search" className={className} {...props} />
    </label>
  );
}
