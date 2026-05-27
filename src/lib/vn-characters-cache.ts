'use client';
import type { VndbCharacter } from './vndb-types';

/** Shape of the /api/vn/[id]/characters response — VndbCharacter + the
 *  server-side `localImage` enrichment from `getCharacterImages`. */
export type VnCharacterRow = VndbCharacter & { localImage: string | null };

/**
 * Audit P-209: per-page shared cache for `/api/vn/[id]/characters`
 * responses. `CharactersSection` and `RoutesSection` both consume the
 * VN's character list on the VN detail page — the former for the
 * full gallery, the latter for the route auto-suggestion list. Before
 * this cache, each component fired its own fetch on mount and the
 * server doubled its work for every detail-page render.
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
      const d = (await r.json()) as { characters: VnCharacterRow[] };
      cache.set(vnId, { data: d.characters, fetchedAt: Date.now() });
      return d.characters;
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
