import 'server-only';

/**
 * Global rate limiter + circuit breaker for every outbound request to
 * api.vndb.org.
 *
 * Design:
 *   - 1 concurrent request at a time, 1 s min gap = 1 req/s ceiling.
 *   - 429 → the **failing caller** sleeps Retry-After (capped at 60 s) and
 *     retries. Up to MAX_RETRY=2 attempts then surface the error.
 *   - Soft circuit breaker: if 3+ 429s pile up in a 60 s window, _other_
 *     callers' acquire() picks up a small extra wait (SOFT_PAUSE_MS = 10 s)
 *     so we slow the herd without stopping it. Single 429 doesn't trip
 *     the circuit — Retry-After applies to that one request only.
 */

const MAX_CONCURRENT = 1;
const MIN_GAP_MS = 1_000;
const MAX_RETRY = 2;
const MAX_RETRY_AFTER_MS = 60_000;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_WINDOW_MS = 60_000;
const SOFT_PAUSE_MS = 10_000;

let activeCount = 0;
let lastStart = 0;
const waiters: Array<() => void> = [];

/** Timestamps of recent 429 responses. Newer entries first. */
const recent429s: number[] = [];
/** Wall-clock deadline returned by the latest 429's Retry-After, for UI. */
let lastRetryAfterUntil = 0;

function trim429Window(): void {
  const cutoff = Date.now() - CIRCUIT_WINDOW_MS;
  while (recent429s.length > 0 && recent429s[recent429s.length - 1] < cutoff) {
    recent429s.pop();
  }
}

function circuitOpen(): boolean {
  trim429Window();
  return recent429s.length >= CIRCUIT_THRESHOLD;
}

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const tryStart = () => {
      // Soft pause when the circuit is open. Affects new acquirers only —
      // the in-flight retry has already paid its Retry-After sleep.
      if (circuitOpen()) {
        setTimeout(tryStart, SOFT_PAUSE_MS);
        return;
      }
      const now = Date.now();
      const sinceLast = now - lastStart;
      if (activeCount < MAX_CONCURRENT && sinceLast >= MIN_GAP_MS) {
        activeCount += 1;
        lastStart = now;
        resolve();
        return;
      }
      const delay = activeCount < MAX_CONCURRENT
        ? Math.max(0, MIN_GAP_MS - sinceLast)
        : 0;
      if (delay > 0) {
        setTimeout(tryStart, delay);
      } else {
        waiters.push(tryStart);
      }
    };
    tryStart();
  });
}

function release(): void {
  activeCount = Math.max(0, activeCount - 1);
  const next = waiters.shift();
  if (next) setTimeout(next, 0);
}

function note429(retryAfterMs: number): void {
  const now = Date.now();
  recent429s.unshift(now);
  trim429Window();
  lastRetryAfterUntil = Math.max(lastRetryAfterUntil, now + retryAfterMs);
  // Tell the in-process pub/sub so SSE clients see the retry countdown
  // transition without waiting for the next job tick. Imported lazily
  // to avoid a circular dep with `download-status` consumers.
  void import('./download-status').then((m) => m.bumpStatus()).catch(() => {
    // Lazy import in a non-Next runtime (tests) may fail; safe to ignore.
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Wrap a fetch through the global throttle. Same signature as `fetch()`.
 * On 429 the calling request sleeps for Retry-After (capped 60s) and
 * retries up to MAX_RETRY times. Other callers are unaffected unless 3+
 * 429s arrive inside a 60s window, in which case acquire() adds a short
 * soft pause.
 */
export async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    await acquire();
    let res: Response;
    try {
      res = await fetch(url, init);
    } finally {
      release();
    }
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('retry-after');
      const headerMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
      const waitMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(2_000, headerMs));
      note429(waitMs);
      if (attempt > MAX_RETRY) return res;
      await sleep(waitMs);
      continue;
    }
    return res;
  }
}

/** Cheap probe to confirm VNDB is responsive again before resuming. */
export async function probeVndbHealthy(): Promise<boolean> {
  try {
    const r = await fetch('https://api.vndb.org/kana/schema', {
      method: 'GET',
      headers: { 'User-Agent': 'vndb-collection/1.0' },
    });
    return r.status < 500 && r.status !== 429;
  } catch {
    return false;
  }
}

/** Live counters surfaced on the home page / data page. */
export function getVndbThrottleStats(): {
  active: number;
  queued: number;
  recent429s: number;
  circuitOpen: boolean;
  retryAfterMs: number;
} {
  trim429Window();
  const remaining = Math.max(0, lastRetryAfterUntil - Date.now());
  return {
    active: activeCount,
    queued: waiters.length,
    recent429s: recent429s.length,
    circuitOpen: circuitOpen(),
    retryAfterMs: remaining,
  };
}
