"use client";

import { useEffect, useRef, useState } from "react";

// Decides whether a search dropdown should open above its input instead of
// below — e.g. the product/vendor search on a long invoice or purchase bill,
// where scrolling down before searching leaves too little room below the
// input for the dropdown to render without being clipped or covering the
// next section. `measure()` is called by the caller at the moment the
// dropdown opens (focus/click/typing) for an immediate, flicker-free
// decision; `open` additionally re-measures on scroll/resize while the
// dropdown is showing, so scrolling the page without blurring the input
// (e.g. via keyboard, or a touch drag) can't leave a stale up/down choice.
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
