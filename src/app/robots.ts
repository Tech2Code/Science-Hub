import type { MetadataRoute } from "next";

// This app is an internal, auth-gated GST billing/inventory tool — nothing
// in it (including the public login/forgot-password pages) has any reason
// to be crawled or indexed. Disallowing everything is a defense-in-depth
// step against a stray crawler indexing/caching the login page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
