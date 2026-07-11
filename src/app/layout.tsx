import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getBusinessSettings } from "@/lib/db";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const { name, logoUrl } = await getBusinessSettings();
  return {
    title: `${name} — Billing & Inventory`,
    description: `Professional GST billing and inventory management for ${name}`,
    ...(logoUrl ? { icons: { icon: logoUrl } } : {}),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { name, tagline, logoUrl } = await getBusinessSettings();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;var a=localStorage.getItem('accentColor');if(a)document.documentElement.style.setProperty('--c-accent',a)}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <Providers initialBranding={{ name, tagline, logoUrl }}>{children}</Providers>
      </body>
    </html>
  );
}
