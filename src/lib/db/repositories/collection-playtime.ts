import { getCollectionListRepository } from './collection-list';
import type { LocalPlaytimeSources } from '@/lib/types';

/**
 * Load collection duration sources for external search and relation cards in one batch.
 *
 * @param vnIds External card ids to enrich.
 * @returns Local sources keyed by owned VN id; non-collection ids remain absent.
 */
export async function getCollectionPlaytimeSources(
  vnIds: readonly string[],
): Promise<Map<string, LocalPlaytimeSources>> {
  if (vnIds.length === 0) return new Map();
  const rows = await getCollectionListRepository().listCards({ vnIds: [...vnIds] });
  return new Map(rows.map((row) => [row.id, {
    playtime_minutes: row.playtime_minutes,
    egs_playtime_minutes: row.egs?.playtime_median_minutes ?? null,
    ai_playtime_minutes: row.ai_playtime?.minutes ?? null,
  }]));
}
