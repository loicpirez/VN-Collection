import 'server-only';

/**
 * Global rate limiter + circuit breaker for every outbound request to
 * api.vndb.org. Sized to keep the burstiest user action — adding a VN
 * which triggers staff + character + producer fan-out — well under
 * VNDB's documented "be reasonable, a few per second" guidance.
 *
 * Concretely:
 *   - 1 concurrent request at a time, 1 second min gap = 1 req/s ceiling.
 *   - 429 → exponential backoff: 2s, 4s, 8s, 16s, 32s (max 5 retries),
 *     respecting Retry-After when present.
 *   - Circuit breaker: if 3+ 429s land in any 60-second window, every
 *     new request waits a full 60 seconds before even acquiring a slot.
 *     This is the "we are clearly being rate-limited" fallback so we
 *     stop hammering and let the server recover.
 */

const MAX_CONCURRENT = 1;
const MIN_GAP_MS = 1_000;
const MAX_RETRY = 2;
const CIRCUIT_THRESHOLD = 1;
// On a single 429, pause everything for 30s so the rate-limit window
// fully drains before we even probe again.
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_PAUSE_MS = 30_000;

let activeCount = 0;
let lastStart = 0;
const waiters: Array<() => void> = [];

/** Timestamps of recent 429 responses. Newer entries first. */
const recent429s: number[] = [];

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
      if (circuitOpen()) {
        setTimeout(tryStart, CIRCUIT_PAUSE_MS);
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

function note429(): void {
  recent429s.unshift(Date.now());
  trim429Window();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Wrap a fetch through the global throttle. Same signature as `fetch()`.
 * 429 responses are retried with exponential backoff and contribute to
 * the circuit-breaker counter; everything else is passed through.
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
      note429();
      if (attempt > MAX_RETRY) return res;
      // Sleep for 30s (or Retry-After if VNDB suggested longer). The
      // circuit-breaker is now open via note429(), so other in-flight
      // callers wait too. After the sleep we probe and resume.
      const retryAfterHeader = res.headers.get('retry-after');
      const headerMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
      const waitMs = Math.max(headerMs, CIRCUIT_PAUSE_MS);
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
} {
  trim429Window();
  return {
    active: activeCount,
    queued: waiters.length,
    recent429s: recent429s.length,
    circuitOpen: circuitOpen(),
  };
}
