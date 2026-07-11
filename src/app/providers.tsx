"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/Toast";
import { BrandingProvider, type Branding } from "@/lib/businessBranding";

export function Providers({ children, initialBranding }: { children: React.ReactNode; initialBranding: Branding }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <BrandingProvider initial={initialBranding}>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </BrandingProvider>
    </SessionProvider>
  );
}
