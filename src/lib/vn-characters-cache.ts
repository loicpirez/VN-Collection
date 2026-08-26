'use client';
import { readVnCharacterRows, type VnCharacterRow } from './vn-character-row';

export type { VnCharacterRow } from './vn-character-row';

/**
 * Per-page shared cache for `/api/vn/[id]/characters` responses.
 * `CharactersSection` and `RoutesSection` both need the character list —
 * without this, each fires its own fetch on mount and the server handles
 * duplicate requests for every detail-page render.
 *
 * The cache is module-level + memory-only: it survives across the
 * two consumers within a single client-side route render but doesn't
 * persist across hard navigation (a new VN detail page = a fresh
 * cache entry). The route handler still has its own 24h server cache
 * — this layer just deduplicates within one page lifecycle.
 *
 * Concurrent calls for the same `vnId` share a single in-flight request, so
 * two `useEffect`s firing on the same tick produce one network request. Each
 * caller retains its own cancellation lifecycle; the shared fetch is aborted
 * only after its last consumer leaves.
 */

interface CacheEntry {
  data: VnCharacterRow[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
interface InflightCharactersRequest {
  controller: AbortController;
  promise: Promise<VnCharacterRow[]>;
  consumers: Set<symbol>;
}

const inflight = new Map<string, InflightCharactersRequest>();

function characterAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}

function subscribeToCharacters(
  vnId: string,
  entry: InflightCharactersRequest,
  signal?: AbortSignal,
): Promise<VnCharacterRow[]> {
  if (signal?.aborted) return Promise.reject(characterAbortReason(signal));
  const consumer = Symbol(vnId);
  entry.consumers.add(consumer);
  return new Promise<VnCharacterRow[]>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', onCallerAbort);
      entry.controller.signal.removeEventListener('abort', onSharedAbort);
      entry.consumers.delete(consumer);
      if (entry.consumers.size === 0 && inflight.get(vnId) === entry) {
        inflight.delete(vnId);
        entry.controller.abort();
      }
    };
    const onCallerAbort = () => {
      release();
      reject(characterAbortReason(signal!));
    };
    const onSharedAbort = () => {
      release();
      reject(characterAbortReason(entry.controller.signal));
    };
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    entry.controller.signal.addEventListener('abort', onSharedAbort, { once: true });
    entry.promise.then(
      (rows) => {
        release();
        resolve(rows);
      },
      (error: unknown) => {
        release();
        reject(error);
      },
    );
  });
}

export async function fetchVnCharacters(
  vnId: string,
  signal?: AbortSignal,
): Promise<VnCharacterRow[]> {
  const hit = cache.get(vnId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }
  const pending = inflight.get(vnId);
  if (pending) return subscribeToCharacters(vnId, pending, signal);

  const controller = new AbortController();
  const p = (async () => {
    const r = await fetch(`/api/vn/${vnId}/characters`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const characters = readVnCharacterRows(await r.json());
    cache.set(vnId, { data: characters, fetchedAt: Date.now() });
    return characters;
  })();
  const entry: InflightCharactersRequest = { controller, promise: p, consumers: new Set() };
  inflight.set(vnId, entry);
  const release = () => {
    if (inflight.get(vnId) === entry) inflight.delete(vnId);
  };
  void p.then(release, release);
  return subscribeToCharacters(vnId, entry, signal);
}

/**
 * Invalidate the cached character list for a VN — used after the
 * user manually re-syncs a VN's metadata or links a new EGS entry.
 */
export function invalidateVnCharactersCache(vnId: string): void {
  cache.delete(vnId);
  const pending = inflight.get(vnId);
  if (!pending) return;
  inflight.delete(vnId);
  pending.controller.abort();
}
