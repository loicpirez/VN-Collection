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

const COALESCE_MS = 60;
// P-195: cap the module-level cache so a user who scrolls past 5000+
// unique VNs doesn't accumulate unbounded entries. Insertion-order Map
// gives us free LRU semantics: re-insert on touch promotes a key to
// the most-recently-used slot, and eviction always targets the front.
const CACHE_MAX = 500;
const cache = new Map<string, StockSummaryEntry | null>();
const listeners = new Map<string, Set<Listener>>();
let queue = new Set<string>();
let queueTimer: ReturnType<typeof setTimeout> | null = null;

function cachePut(vnId: string, entry: StockSummaryEntry | null) {
  if (cache.has(vnId)) cache.delete(vnId);
  cache.set(vnId, entry);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function cacheTouch(vnId: string, entry: StockSummaryEntry | null) {
  cache.delete(vnId);
  cache.set(vnId, entry);
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
  const cached = cache.get(vnId);
  if (cached !== undefined) {
    // Promote to MRU so an active subscriber's entry doesn't get
    // evicted by unrelated cache churn.
    cacheTouch(vnId, cached);
    listener(cached);
  } else {
    queue.add(vnId);
    if (!queueTimer) queueTimer = setTimeout(flushQueue, COALESCE_MS);
  }
  return () => {
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
