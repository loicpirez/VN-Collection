/**
 * Client-side helper to lazily batch-fetch stock summaries for a set of
 * VN IDs. Built around a tiny request-coalescing queue so 200 card chips
 * mounted in one render only hit the server once per ~50ms window.
 *
 * No React state inside — consumers wire this through their own hook
 * (`useStockSummaryChip` below) to avoid stale closures and to clean up
 * pending listeners on unmount.
 */

export interface StockSummaryEntry {
  available: number;
  best_price: number | null;
}

type Listener = (entry: StockSummaryEntry | null) => void;

interface CacheRecord {
  entry: StockSummaryEntry | null;
  at: number;
}

const COALESCE_MS = 60;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheRecord>();
const listeners = new Map<string, Set<Listener>>();
let queue = new Set<string>();
let queueTimer: ReturnType<typeof setTimeout> | null = null;

function cachePut(vnId: string, entry: StockSummaryEntry | null) {
  if (cache.has(vnId)) cache.delete(vnId);
  cache.set(vnId, { entry, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function cacheTouch(vnId: string, record: CacheRecord) {
  cache.delete(vnId);
  cache.set(vnId, record);
}

function cacheGet(vnId: string): CacheRecord | undefined {
  const record = cache.get(vnId);
  if (record === undefined) return undefined;
  if (Date.now() - record.at > CACHE_TTL_MS) {
    cache.delete(vnId);
    return undefined;
  }
  return record;
}

function notify(vnId: string, entry: StockSummaryEntry | null) {
  cachePut(vnId, entry);
  const set = listeners.get(vnId);
  if (!set) return;
  for (const cb of set) {
    try { cb(entry); } catch { /* listener errors must not break the loop */ }
  }
}

async function flushQueue() {
  queueTimer = null;
  const ids = [...queue];
  queue = new Set();
  if (ids.length === 0) return;
  try {
    const params = new URLSearchParams();
    params.set('ids', ids.join(','));
    const res = await fetch(`/api/stock/summary?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      for (const id of ids) notify(id, null);
      return;
    }
    const data = (await res.json()) as { summary?: Record<string, StockSummaryEntry> };
    const summary = data.summary ?? {};
    for (const id of ids) notify(id, summary[id] ?? null);
  } catch {
    for (const id of ids) notify(id, null);
  }
}

/** Subscribe to a single VN's stock summary; returns unsubscribe. */
export function subscribeStockSummary(vnId: string, listener: Listener): () => void {
  const set = listeners.get(vnId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(vnId, set);
  let alive = true;
  const cached = cacheGet(vnId);
  if (cached !== undefined) {
    const entry = cached.entry;
    cacheTouch(vnId, cached);
    queueMicrotask(() => { if (alive) listener(entry); });
  } else {
    queue.add(vnId);
    if (!queueTimer) queueTimer = setTimeout(flushQueue, COALESCE_MS);
  }
  return () => {
    alive = false;
    const cur = listeners.get(vnId);
    if (!cur) return;
    cur.delete(listener);
    if (cur.size === 0) listeners.delete(vnId);
  };
}

/** Test-only: clears all coalescing state. */
export function _resetStockSummaryClient() {
  cache.clear();
  listeners.clear();
  queue = new Set();
  if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
}
