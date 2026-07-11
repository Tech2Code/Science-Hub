"use client";

import { createContext, useContext, useState } from "react";

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
  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
