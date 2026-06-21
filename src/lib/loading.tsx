"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const DEBOUNCE_MS = 180;   // skip loader if fetch finishes under this
const FADE_MS     = 180;   // fade-in & fade-out duration

const Ctx = createContext<{ show: () => void; hide: () => void }>({
  show: () => {},
  hide: () => {},
});

/* ── fetch interceptor — no changes needed in any page ─────────── */
function FetchWatcher() {
  const { show, hide } = useContext(Ctx);

  useEffect(() => {
    const orig        = window.fetch;
    let count         = 0;
    let debounceId:   ReturnType<typeof setTimeout> | null = null;
    let shownAt:      number | null = null;

    function doShow() {
      shownAt = Date.now();
      show();
    }

    function scheduleHide() {
      if (shownAt === null) return;           // never shown, nothing to hide
      shownAt = null;
      hide();
    }

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      // pages with their own skeleton can pass x-no-loader header to opt out
      const init = args[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers);
      const silent = headers.get("x-no-loader") === "1";
      if (silent) return orig(...args);

      count++;

      // schedule show (debounced — only if not already visible and no debounce pending)
      if (count === 1 && shownAt === null && !debounceId) {
        debounceId = setTimeout(doShow, DEBOUNCE_MS);
      }

      try {
        return await orig(...args);
      } finally {
        count = Math.max(0, count - 1);
        if (count === 0) {
          if (debounceId) { clearTimeout(debounceId); debounceId = null; }
          scheduleHide();
        }
      }
    };

    return () => { window.fetch = orig; };
  }, [show, hide]);

  return null;
}

/* ── spinner UI ─────────────────────────────────────────────────── */
function Loader({ phase }: { phase: "in" | "out" }) {
  return (
    <>
      <style>{`
        @keyframes _spin  { to { transform: rotate(360deg); } }
        @keyframes _fIn   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes _fOut  { from { opacity: 1; } to { opacity: 0; } }
        ._loader-ring {
          width: 44px; height: 44px;
          border: 3.5px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: _spin 0.7s linear infinite;
        }
      `}</style>

      {/* overlay — semi-transparent so page is visible underneath */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
        animation: `${phase === "in" ? "_fIn" : "_fOut"} ${FADE_MS}ms ease forwards`,
        pointerEvents: phase === "out" ? "none" : "all",
      }}>
        <div className="_loader-ring" />
        <span style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: "0.8125rem", fontWeight: 500, letterSpacing: "0.04em",
        }}>
          Loading…
        </span>
      </div>
    </>
  );
}

/* ── provider ────────────────────────────────────────────────────── */
export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"in" | "out" | null>(null);
  const exitId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (exitId.current) { clearTimeout(exitId.current); exitId.current = null; }
    setPhase("in");
  }, []);

  const hide = useCallback(() => {
    setPhase("out");
    exitId.current = setTimeout(() => setPhase(null), FADE_MS);
  }, []);

  return (
    <Ctx.Provider value={{ show, hide }}>
      <FetchWatcher />
      {children}
      {phase !== null && <Loader phase={phase} />}
    </Ctx.Provider>
  );
}
