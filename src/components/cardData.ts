import type { CardData } from './VnCard';
import type { CollectionItem, Status } from '@/lib/types';

/**
 * Project a heavy `CollectionItem` (everything the DB row carries) down
 * to the lean `CardData` props that `<VnCard>` actually reads.
 *
 * The projection is WeakMap-cached on the input row so a re-render that
 * doesn't change the underlying object yields the same `CardData`
 * reference — `React.memo(VnCard)` then bails on `Object.is`-equal
 * props. Inline `data={{...}}` callers defeated the memo entirely.
 *
 * The cache is keyed on identity; a fresh fetch (new objects) yields
 * misses. Callers that want the projection across an items-array
 * change can wrap the call in `useMemo(() => items.map(toCardData),
 * [items])`.
 */
const cardDataCache = new WeakMap<CollectionItem, CardData>();

export function toCardData(it: CollectionItem): CardData {
  const cached = cardDataCache.get(it);
  if (cached) return cached;
  const data: CardData = {
    id: it.id,
    title: it.title,
    alttitle: it.alttitle,
    poster: it.image_url || it.image_thumb,
    localPoster: it.local_image || it.local_image_thumb,
    customCover: it.custom_cover,
    sexual: it.image_sexual,
    released: it.released,
    egs_median: it.egs?.median ?? null,
    egs_playtime_minutes: it.egs?.playtime_median_minutes ?? null,
    rating: it.rating,
    user_rating: it.user_rating,
    playtime_minutes: it.playtime_minutes,
    length_minutes: it.length_minutes,
    status: it.status as Status | undefined,
    favorite: it.favorite,
    inReadingQueue: it.in_reading_queue,
    developers: it.developers,
    publishers: it.publishers,
    isFanDisc: (it.relations ?? []).some((r) => r.relation === 'orig'),
    // Annotated by the `/api/collection` route via
    // `countListMembershipsByVn` — gives the ListsPicker its initial
    // badge count without a popover open.
    listCount: it.list_count ?? 0,
    inCollectionBadge: !!it.status,
  };
  cardDataCache.set(it, data);
  return data;
}

