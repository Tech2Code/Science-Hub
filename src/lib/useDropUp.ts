"use client";

import { useEffect, useRef, useState } from "react";

// Flips a search dropdown to open upward when there's not enough room below.
// Re-measures on scroll/resize while open so a stale choice can't linger.
export function useDropUp(open: boolean, estimatedHeight = 210) {
  const [dropUp, setDropUp] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);

  function measure(el: HTMLElement | null) {
    elRef.current = el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setDropUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
  }

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      if (elRef.current) measure(elRef.current);
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure() is stable (only touches refs/state setters)
  }, [open]);

  return { dropUp, measure };
}
