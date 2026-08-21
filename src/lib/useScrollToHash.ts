import { useEffect } from "react";

// Scrolls to the `#hash`-targeted element once `ready` (real content in DOM, not a skeleton). Used by global-search deep links into Settings/Admin.
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    function scrollToCurrentHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const timer = setTimeout(scrollToCurrentHash, 50);
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", scrollToCurrentHash);
    };
  }, [ready]);
}
