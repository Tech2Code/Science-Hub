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

type RateLimitResult = { allowed: boolean; retryAfterMs: number };

const REDIS_TIMEOUT_MS = 1500;

/**
 * Shared (cross-instance) fixed-window limiter for unauthenticated, brute-forceable endpoints
 * (login, password reset, find-email). Uses Upstash Redis over its REST API when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, so counts survive across serverless
 * instances and redeploys. With the env vars unset, or if Redis is unreachable, it falls back to the
 * per-instance in-memory `rateLimit()` — never fails closed, so a Redis outage can't lock everyone out.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return rateLimit(key, limit, windowMs);

  const redisKey = `rl:${key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    // INCR, then set the expiry only on the first hit of a window (NX), then read the remaining TTL.
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs), "NX"],
        ["PTTL", redisKey],
      ]),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    const out = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = out[0]?.result;
    const ttl = out[2]?.result;
    if (typeof count !== "number" || out[0]?.error) throw new Error("Unexpected Upstash response");
    if (ttl === -1) {
      // The key exists with no expiry (INCR landed but the NX expire didn't) — without repair it
      // would block this caller forever. Best-effort: set the window expiry now.
      await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["PEXPIRE", redisKey, String(windowMs)]]),
        signal: controller.signal,
        cache: "no-store",
      });
    }
    if (count > limit) {
      return { allowed: false, retryAfterMs: typeof ttl === "number" && ttl > 0 ? ttl : windowMs };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    console.error("[rateLimit] shared store unavailable, using in-memory fallback", err instanceof Error ? err.message : err);
    return rateLimit(key, limit, windowMs);
  } finally {
    clearTimeout(timer);
  }
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
