// Lightweight in-memory fixed-window rate limiter for sensitive, low-traffic
// endpoints (login, password reset, invoice email). This is a single-instance
// mitigation, not a distributed one — on serverless platforms with multiple
// concurrent instances each instance tracks its own counters, so treat this
// as defense-in-depth rather than a hard guarantee. For strict enforcement
// across instances, back this with Redis/Upstash instead.
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
  // x-forwarded-for is client-suppliable and trivially spoofed to defeat
  // per-IP rate limiting. Prefer headers the platform itself sets and a
  // client can't override: on Vercel that's x-vercel-forwarded-for (or
  // x-real-ip behind a trusted proxy). Only fall back to the spoofable
  // x-forwarded-for when neither is present (e.g. local dev), where it's
  // the best signal available but not a security boundary.
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
