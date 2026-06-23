"use client";

import { createContext, useContext } from "react";

const ThemeContext = createContext<{ toggle: () => void }>({ toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const toggle = () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("theme", next);

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
  };

  return (
    <ThemeContext.Provider value={{ toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
