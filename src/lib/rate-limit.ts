/**
 * R5-SEC-006 dependency-free in-memory rate limiter for API routes that
 * spend a third-party API call (VNDB / ErogameScape) on every hit.
 *
 * A fixed-window counter keyed by an arbitrary string (routes compose
 * `<route>:<client-ip>`). State lives in a single module-level Map, so the
 * limiter is per-process and resets on restart, appropriate for a
 * self-hosted single-user app where the goal is to blunt a runaway loop or
 * a hostile scraper from burning the upstream throttle budget rather than to
 * be a distributed quota system.
 *
 * Expired windows are pruned opportunistically once the Map grows past
 * `PRUNE_THRESHOLD`, keeping memory bounded without a background timer.
 */

interface WindowState {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, WindowState>();

/**
 * Sweep the Map once it grows past this many distinct keys, dropping every
 * entry whose window has fully elapsed relative to `now`.
 */
const PRUNE_THRESHOLD = 1024;

/**
 * Options for {@link rateLimit}: the maximum number of requests permitted
 * within each `windowMs` fixed window for a given key.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /**
   * Clock injection point. Defaults to `Date.now`; tests pass a fixed value
   * so window boundaries are deterministic without real timers.
   */
  now?: number;
}

/**
 * Outcome of a {@link rateLimit} check. `ok` is `false` once the key has
 * exceeded `limit` within the current window; `retryAfterMs` is then the
 * milliseconds until the window resets, suitable for a `Retry-After` header
 * (which the caller rounds up to whole seconds).
 */
export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, state] of buckets) {
    if (now - state.windowStart >= windowMs) buckets.delete(key);
  }
}

/**
 * Account one request against `key` and report whether it is allowed.
 *
 * Fixed-window semantics: the first request for a key opens a window that
 * lasts `windowMs`; up to `limit` requests inside that window return
 * `{ ok: true }`. The `(limit + 1)`-th returns `{ ok: false, retryAfterMs }`
 * without incrementing further, so a flood cannot extend the window. When
 * the window has elapsed the next request opens a fresh one.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = opts.now ?? Date.now();
  const { limit, windowMs } = opts;

  if (buckets.size > PRUNE_THRESHOLD) pruneExpired(now, windowMs);

  const state = buckets.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (state.count >= limit) {
    return { ok: false, retryAfterMs: state.windowStart + windowMs - now };
  }

  state.count += 1;
  return { ok: true };
}

/**
 * Best-effort client IP for rate-limit keying, read the same way
 * `auth-gate` consults forwarded headers: the first `x-forwarded-for` hop
 * when present, else the URL host. This is a partition key, not a trust
 * boundary: a spoofed value only buckets the abuser under a different
 * label, and the auth gate remains the actual access control.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return new URL(req.url).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}
