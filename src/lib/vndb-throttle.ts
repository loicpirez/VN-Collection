import 'server-only';
import { isAllowedHttpTarget } from './url-allowlist';
import type { ProviderId } from './proxy-config';
import { providerFetch } from './proxy-fetch';

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
/** Base delay for network-error retries (doubles per attempt: 1s → 2s). */
const NET_ERR_RETRY_BASE_MS = 1_000;

let activeCount = 0;
let lastStart = 0;
let activeLabel: string | null = null;

interface ThrottleWaiter {
  label: string;
  signal?: AbortSignal | null;
  resolve: () => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
  onAbort: () => void;
}

const waiters: ThrottleWaiter[] = [];

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

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}

function pumpQueue(): void {
  if (activeCount >= MAX_CONCURRENT) return;
  const waiter = waiters[0];
  if (!waiter) return;

  const now = Date.now();
  const delay = circuitOpen()
    ? SOFT_PAUSE_MS
    : Math.max(0, MIN_GAP_MS - (now - lastStart));
  if (delay > 0) {
    if (!waiter.timer) {
      waiter.timer = setTimeout(() => {
        waiter.timer = null;
        pumpQueue();
      }, delay);
    }
    return;
  }

  waiters.shift();
  waiter.settled = true;
  waiter.signal?.removeEventListener('abort', waiter.onAbort);
  activeCount += 1;
  activeLabel = waiter.label;
  lastStart = now;
  waiter.resolve();
}

function acquire(label: string, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const waiter: ThrottleWaiter = {
      label,
      signal,
      resolve,
      reject,
      timer: null,
      settled: false,
      onAbort: () => {
        if (waiter.settled) return;
        waiter.settled = true;
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.timer = null;
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        signal?.removeEventListener('abort', waiter.onAbort);
        reject(abortReason(signal!));
        pumpQueue();
      },
    };
    waiters.push(waiter);
    signal?.addEventListener('abort', waiter.onAbort, { once: true });
    pumpQueue();
  });
}

function release(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) activeLabel = null;
  pumpQueue();
}

function note429(retryAfterMs: number): void {
  const now = Date.now();
  recent429s.unshift(now);
  trim429Window();
  lastRetryAfterUntil = Math.max(lastRetryAfterUntil, now + retryAfterMs);
  // Tell the in-process pub/sub so SSE clients see the retry countdown
  // transition without waiting for the next job tick. Imported lazily
  // to avoid a circular dep with `download-status` consumers.
  void import('./download-status').then((m) => m.bumpStatus());
}

async function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) throw abortReason(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wrap a fetch through the global throttle. Same signature as `fetch()`.
 *
 * Retry policy (both paths respect MAX_RETRY total):
 *   - 429 → sleep Retry-After (capped 60 s), then retry.
 *   - Network error (TypeError: fetch failed, ECONNRESET, etc.) →
 *     exponential back-off starting at NET_ERR_RETRY_BASE_MS, then retry.
 *     The quota is shared with 429 retries so the total attempt cap is
 *     MAX_RETRY regardless of which error triggered the retry.
 *
 * Other callers are unaffected unless 3+ 429s pile up in a 60 s window,
 * in which case acquire() adds a soft 10 s pause.
 */
export async function throttledFetch(url: string, init?: RequestInit, provider: ProviderId = 'vndb'): Promise<Response> {
  if (!isAllowedHttpTarget(url)) {
    throw new Error(`vndb-throttle: refusing fetch to non-allowlisted URL ${url}`);
  }
  let attempt = 0;
  const requestLabel = `${provider}:${new URL(url).pathname}`;
  while (true) {
    attempt += 1;
    await acquire(requestLabel, init?.signal);
    let res: Response;
    try {
      res = await providerFetch(url, init ?? {}, provider);
    } catch (err) {
      release();
      if (
        init?.signal?.aborted === true ||
        (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
      ) throw err;
      if (attempt > MAX_RETRY) throw err;
      await sleep(Math.min(MAX_RETRY_AFTER_MS, NET_ERR_RETRY_BASE_MS * (2 ** (attempt - 1))), init?.signal);
      continue;
    }
    release();
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('retry-after');
      const headerMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
      const waitMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(2_000, headerMs));
      note429(waitMs);
      if (attempt > MAX_RETRY) return res;
      await sleep(waitMs, init?.signal);
      continue;
    }
    return res;
  }
}

/** Live counters surfaced on the home page / data page. */
export function getVndbThrottleStats(): {
  active: number;
  queued: number;
  recent429s: number;
  circuitOpen: boolean;
  retryAfterMs: number;
  activeRequest: string | null;
  queuedRequests: string[];
} {
  trim429Window();
  const remaining = Math.max(0, lastRetryAfterUntil - Date.now());
  return {
    active: activeCount,
    queued: waiters.length,
    recent429s: recent429s.length,
    circuitOpen: circuitOpen(),
    retryAfterMs: remaining,
    activeRequest: activeLabel,
    queuedRequests: waiters.map((waiter) => waiter.label),
  };
}
