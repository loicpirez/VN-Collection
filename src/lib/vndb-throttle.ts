import 'server-only';

/**
 * Global rate limiter for every outbound request to api.vndb.org (and its
 * mirror). Without this, fan-out paths — adding a single VN triggers a
 * fetch for that VN plus all its staff, characters, and producers — can
 * burst dozens of requests in a second, which is rude at best and gets
 * the IP throttled at worst.
 *
 * Two layers:
 *   1. Semaphore caps total in-flight to MAX_CONCURRENT.
 *   2. A per-slot inter-request delay (MIN_GAP_MS) means even fully
 *      pipelined work tops out at ~4 requests per second under steady load.
 *
 * On HTTP 429 we sleep for the Retry-After header (defaulting to 5s) and
 * retry once. Higher backoff would be silly — the user-facing tooling
 * needs to fail fast if VNDB is really overloaded.
 */

const MAX_CONCURRENT = 4;
const MIN_GAP_MS = 250;
const MAX_RETRY = 2;

let activeCount = 0;
let lastStart = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const tryStart = () => {
      const now = Date.now();
      const sinceLast = now - lastStart;
      if (activeCount < MAX_CONCURRENT && sinceLast >= MIN_GAP_MS) {
        activeCount += 1;
        lastStart = now;
        resolve();
        return;
      }
      // Either at concurrency cap or too soon since last start. Defer.
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Wrap a fetch through the global throttle. Same signature as `fetch()`;
 * preserves the caller's error semantics except 429, which is retried
 * automatically after honoring Retry-After.
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
    if (res.status === 429 && attempt <= MAX_RETRY) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader
        ? Math.min(30_000, Math.max(500, Number(retryAfterHeader) * 1000))
        : 5_000;
      await sleep(retryAfterMs);
      continue;
    }
    return res;
  }
}

/** Live counters surfaced on the home page / data page. */
export function getVndbThrottleStats(): { active: number; queued: number } {
  return { active: activeCount, queued: waiters.length };
}
