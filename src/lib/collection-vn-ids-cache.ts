import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';

const COLLECTION_VN_IDS_TTL_MS = 30_000;

interface CollectionVnIdsCacheEntry {
  ids: string[];
  expiresAt: number;
}

let cachedEntry: CollectionVnIdsCacheEntry | null = null;
let inFlight: Promise<string[]> | null = null;
let cacheGeneration = 0;

/**
 * List collection VN ids through a short asynchronous repository cache.
 * Concurrent aspect-filter requests share one scan, and callers receive a
 * copy so they cannot mutate the cached membership snapshot.
 *
 * @returns Every VN id currently present in the collection.
 */
export async function getCachedCollectionVnIds(): Promise<string[]> {
  const now = Date.now();
  if (cachedEntry && cachedEntry.expiresAt > now) return [...cachedEntry.ids];
  if (inFlight) return [...await inFlight];

  const requestGeneration = cacheGeneration;
  const request = getCollectionCoreRepository().listIds()
    .then((ids) => {
      if (requestGeneration === cacheGeneration) {
        cachedEntry = { ids: [...ids], expiresAt: Date.now() + COLLECTION_VN_IDS_TTL_MS };
      }
      return ids;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return [...await request];
}

/**
 * Invalidate the collection-membership snapshot after a successful add or
 * remove operation, including any older repository read still in flight.
 *
 * @returns Nothing.
 */
export function invalidateCollectionVnIdsCache(): void {
  cacheGeneration += 1;
  cachedEntry = null;
  inFlight = null;
}
