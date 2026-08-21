"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Branding = { name: string; tagline: string; logoUrl: string };

const DEFAULT_BRANDING: Branding = { name: "Science Hub", tagline: "", logoUrl: "" };

const BrandingContext = createContext<{ branding: Branding; setBranding: (b: Branding) => void }>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
});

// Seeded server-side from RootLayout so first render already has the real name/logo (no flash of defaults); setBranding lets Settings push a live update.
export function BrandingProvider({ initial, children }: { initial: Branding; children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(initial);

  // Wrapped routes are statically optimized, so `initial` is fixed at build time — this background refresh is the only way branding changes appear without a redeploy. No-ops on failure.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding", { headers: { "x-no-loader": "1" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((fresh: Branding | null) => {
        if (!cancelled && fresh) setBranding(fresh);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
