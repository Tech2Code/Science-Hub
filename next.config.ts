import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.4",
  ],
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
