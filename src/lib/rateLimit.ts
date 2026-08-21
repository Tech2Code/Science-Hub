// In-memory fixed-window rate limiter. Single-instance only — each serverless instance tracks its own counters, so this is defense-in-depth, not a hard guarantee.
const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically drop expired buckets so this map can't grow unbounded.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (buckets.size > 5000) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function getClientIp(request: Request): string {
  // x-forwarded-for is client-spoofable; prefer platform-set headers (Vercel's x-vercel-forwarded-for, then x-real-ip) and only fall back to it for local dev.
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
