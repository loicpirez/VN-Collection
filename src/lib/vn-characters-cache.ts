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
 * Concurrent calls for the same `vnId` share a single in-flight
 * Promise (`Map<vnId, Promise>`), so two `useEffect`s firing on the
 * same tick produce ONE network request, not two.
 */

interface CacheEntry {
  data: VnCharacterRow[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<VnCharacterRow[]>>();

export async function fetchVnCharacters(
  vnId: string,
  signal?: AbortSignal,
): Promise<VnCharacterRow[]> {
  const hit = cache.get(vnId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }
  const pending = inflight.get(vnId);
  if (pending) return pending;

  const p = (async () => {
    try {
      const r = await fetch(`/api/vn/${vnId}/characters`, {
        signal,
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const characters = readVnCharacterRows(await r.json());
      cache.set(vnId, { data: characters, fetchedAt: Date.now() });
      return characters;
    } finally {
      inflight.delete(vnId);
    }
  })();
  inflight.set(vnId, p);
  return p;
}

/**
 * Invalidate the cached character list for a VN — used after the
 * user manually re-syncs a VN's metadata or links a new EGS entry.
 */
export function invalidateVnCharactersCache(vnId: string): void {
  cache.delete(vnId);
  inflight.delete(vnId);
}
