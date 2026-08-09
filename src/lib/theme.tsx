"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Auto mode has no dusk/dawn API to call, so it uses a fixed clock window
// instead: 7 PM–6 AM reads as "night" everywhere the business operates.
const AUTO_DARK_START_HOUR = 19;
const AUTO_DARK_END_HOUR = 6;

function computeAutoTheme(): "light" | "dark" {
  const hour = new Date().getHours();
  return hour >= AUTO_DARK_START_HOUR || hour < AUTO_DARK_END_HOUR ? "dark" : "light";
}

function applyTheme(next: "light" | "dark") {
  const apply = () => {
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
  };

  if (document.startViewTransition) {
    // Suppress element-level CSS transitions for the duration of the View Transition
    // so they don't create a second animation when the DOM is revealed.
    document.documentElement.setAttribute("data-vt", "");
    const vt = document.startViewTransition(apply);
    vt.finished.finally(() => document.documentElement.removeAttribute("data-vt"));
  } else {
    apply();
  }
}

const ThemeContext = createContext<{
  toggle: () => void;
  setAccent: (hex: string | null) => void;
  isAuto: boolean;
  setAuto: (enabled: boolean) => void;
}>({
  toggle: () => {},
  setAccent: () => {},
  isAuto: false,
  setAuto: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isAuto, setIsAuto] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("themeMode") === "auto"
  );

  useEffect(() => {
    if (!isAuto) return;
    applyTheme(computeAutoTheme());
    const id = setInterval(() => applyTheme(computeAutoTheme()), 60_000);
    return () => clearInterval(id);
  }, [isAuto]);

  const setAuto = (enabled: boolean) => {
    localStorage.setItem("themeMode", enabled ? "auto" : "manual");
    if (!enabled) {
      const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
      localStorage.setItem("theme", current);
    }
    setIsAuto(enabled);
  };

  // Per-user accent color (not org-wide) — persisted in localStorage only,
  // same imperative DOM-write pattern as toggle() below (no React state, so
  // there's nothing to keep in sync/hydrate).
  const setAccent = (hex: string | null) => {
    if (hex) {
      localStorage.setItem("accentColor", hex);
      document.documentElement.style.setProperty("--c-accent", hex);
    } else {
      localStorage.removeItem("accentColor");
      document.documentElement.style.removeProperty("--c-accent");
    }
  };

  const toggle = () => {
    // A manual flip always wins over auto mode, same as picking a preset overrides "auto".
    if (isAuto) {
      localStorage.setItem("themeMode", "manual");
      setIsAuto(false);
    }
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ toggle, setAccent, isAuto, setAuto }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
