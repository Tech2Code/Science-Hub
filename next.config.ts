import type { NextConfig } from "next";

// Inline theme-flicker script in src/app/layout.tsx and widespread inline
// `style={{...}}` usage across the dashboard require 'unsafe-inline' for
// script-src/style-src — a nonce-based CSP would need middleware.ts to mint
// and thread a per-request nonce, which is a larger follow-up change.
//
// 'unsafe-eval' is added to script-src only in development — Next/React's
// dev server (Turbopack HMR, the dev error overlay) uses eval() for
// debugging. Production React never calls eval(), so it's omitted there.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'self'",
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.4",
  ],
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
    ];
  },
  async redirects() {
    return [
      { source: "/",                    destination: "/dashboard",                 permanent: false },
      { source: "/customers",           destination: "/sales/customers",           permanent: true },
      { source: "/customers/:path*",    destination: "/sales/customers/:path*",    permanent: true },
      { source: "/invoices",            destination: "/sales/invoices",            permanent: true },
      { source: "/invoices/:path*",     destination: "/sales/invoices/:path*",     permanent: true },
      { source: "/payments",            destination: "/sales/payments",            permanent: true },
      { source: "/vendors",             destination: "/purchases/vendors",         permanent: true },
      { source: "/vendors/:path*",      destination: "/purchases/vendors/:path*",  permanent: true },
      { source: "/reports",             destination: "/reports/sales",             permanent: true },
    ];
  },
};

export default nextConfig;
