"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Branding = { name: string; tagline: string; logoUrl: string };

const DEFAULT_BRANDING: Branding = { name: "Science Hub", tagline: "", logoUrl: "" };

const BrandingContext = createContext<{ branding: Branding; setBranding: (b: Branding) => void }>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
});

// Seeded server-side from RootLayout (via Providers) so every consumer's
// first render already has the real business name/logo — no client fetch,
// no flash of the default logo/name before the real one loads. setBranding
// lets the Settings page push a live update after a save without a reload.
export function BrandingProvider({ initial, children }: { initial: Branding; children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(initial);

  // Several routes this Provider wraps (login, forgot-password, find-email,
  // reset-password, and most dashboard pages) are statically optimized by
  // Next.js, so `initial` above is whatever business branding existed at
  // the last build/deploy — it never re-runs per request. A background
  // refresh on mount is the only way these pages pick up a branding change
  // made via Settings without waiting for the next deployment. Silently
  // no-ops on failure — a stale-but-present logo/name beats a blank one.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding", { headers: { "x-no-loader": "1" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((fresh: Branding | null) => {
        if (!cancelled && fresh) setBranding(fresh);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time refresh on mount, not meant to re-run
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
