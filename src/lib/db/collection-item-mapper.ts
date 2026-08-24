import type {
  BoxType,
  CollectionItem,
  EditionType,
  Location,
  Status,
} from '@/lib/types';
import { parsePhysicalLocations } from '@/lib/physical-locations';
import {
  isPersistedEditions,
  isPersistedExtlinks,
  isPersistedProducerSummaries,
  isPersistedRelations,
  isPersistedReleaseImages,
  isPersistedScreenshots,
  isPersistedStaff,
  isPersistedStringArray,
  isPersistedTags,
  isPersistedTitles,
  isPersistedVa,
} from '@/lib/vn-persisted-json-shape';

/** Raw joined VN and collection projection shared by both database engines. */
export interface CollectionItemDatabaseRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  image_violence: number | null;
  released: string | null;
  olang: string | null;
  languages: string | null;
  platforms: string | null;
  length_minutes: number | null;
  length: number | null;
  rating: number | null;
  votecount: number | null;
  description: string | null;
  developers: string | null;
  publishers: string | null;
  tags: string | null;
  screenshots: string | null;
  release_images: string | null;
  local_image: string | null;
  local_image_thumb: string | null;
  custom_cover: string | null;
  banner_image: string | null;
  banner_position: string | null;
  cover_rotation: number | null;
  banner_rotation: number | null;
  relations: string | null;
  aliases: string | null;
  extlinks: string | null;
  length_votes: number | null;
  average: number | null;
  has_anime: number | null;
  devstatus: number | null;
  titles: string | null;
  editions: string | null;
  staff: string | null;
  va: string | null;
  fetched_at: number;
  status?: string | null;
  user_rating?: number | null;
  playtime_minutes?: number | null;
  started_date?: string | null;
  finished_date?: string | null;
  notes?: string | null;
  favorite?: number | null;
  location?: string | null;
  edition_type?: string | null;
  edition_label?: string | null;
  physical_location?: string | null;
  box_type?: string | null;
  download_url?: string | null;
  dumped?: number | null;
  dumped_ignored?: number | null;
  custom_description?: string | null;
  added_at?: number;
  updated_at?: number;
}

function parseJson<T>(
  raw: string | null | undefined,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function defineLazyJson<T>(
  target: object,
  key: string,
  raw: string | null | undefined,
  fallback: T,
  validate: (value: unknown) => value is T,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get(): T {
      const value = parseJson(raw, fallback, validate);
      Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return value;
    },
    set(value: T) {
      Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
  });
}

function normalizedRotation(raw: number | null | undefined): 0 | 90 | 180 | 270 {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const normalized = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

/**
 * Map a database projection to the stable collection-item contract.
 *
 * JSON fields remain lazy and enumerable so both engines preserve the existing
 * parse timing, object identity, property ordering, and malformed-value fallback.
 *
 * @param row Joined VN and optional collection row.
 * @returns The normalized item, or `null` when no VN row exists.
 */
export function mapCollectionItemRow(
  row: CollectionItemDatabaseRow | undefined,
): CollectionItem | null {
  if (!row) return null;
  const item = {} as CollectionItem;
  item.id = row.id;
  item.title = row.title;
  item.alttitle = row.alttitle;
  item.image_url = row.image_url;
  item.image_thumb = row.image_thumb;
  item.image_sexual = row.image_sexual;
  item.image_violence = row.image_violence;
  item.released = row.released;
  item.olang = row.olang;
  defineLazyJson(item, 'languages', row.languages, [] as string[], isPersistedStringArray);
  defineLazyJson(item, 'platforms', row.platforms, [] as string[], isPersistedStringArray);
  item.length_minutes = row.length_minutes;
  item.length = row.length;
  item.rating = row.rating;
  item.votecount = row.votecount;
  item.description = row.description;
  defineLazyJson(item, 'developers', row.developers, [] as CollectionItem['developers'], isPersistedProducerSummaries);
  defineLazyJson(item, 'publishers', row.publishers, [] as CollectionItem['publishers'], isPersistedProducerSummaries);
  defineLazyJson(item, 'tags', row.tags, [] as CollectionItem['tags'], isPersistedTags);
  defineLazyJson(item, 'screenshots', row.screenshots, [] as CollectionItem['screenshots'], isPersistedScreenshots);
  defineLazyJson(item, 'release_images', row.release_images, [] as CollectionItem['release_images'], isPersistedReleaseImages);
  item.local_image = row.local_image;
  item.local_image_thumb = row.local_image_thumb;
  item.custom_cover = row.custom_cover;
  item.banner_image = row.banner_image;
  item.banner_position = row.banner_position;
  item.cover_rotation = normalizedRotation(row.cover_rotation);
  item.banner_rotation = normalizedRotation(row.banner_rotation);
  defineLazyJson(item, 'relations', row.relations, [] as CollectionItem['relations'], isPersistedRelations);
  defineLazyJson(item, 'aliases', row.aliases, [] as string[], isPersistedStringArray);
  defineLazyJson(item, 'extlinks', row.extlinks, [] as CollectionItem['extlinks'], isPersistedExtlinks);
  item.length_votes = row.length_votes ?? null;
  item.average = row.average ?? null;
  item.has_anime = row.has_anime == null ? null : Boolean(row.has_anime);
  item.devstatus = row.devstatus == null ? null : (row.devstatus as 0 | 1 | 2);
  defineLazyJson(item, 'titles', row.titles, [] as CollectionItem['titles'], isPersistedTitles);
  defineLazyJson(item, 'editions', row.editions, [] as CollectionItem['editions'], isPersistedEditions);
  defineLazyJson(item, 'staff', row.staff, [] as CollectionItem['staff'], isPersistedStaff);
  defineLazyJson(item, 'va', row.va, [] as CollectionItem['va'], isPersistedVa);
  item.fetched_at = row.fetched_at;
  item.status = row.status == null ? undefined : row.status as Status;
  item.user_rating = row.user_rating ?? null;
  item.playtime_minutes = row.playtime_minutes ?? 0;
  item.started_date = row.started_date ?? null;
  item.finished_date = row.finished_date ?? null;
  item.notes = row.notes ?? null;
  item.favorite = Boolean(row.favorite);
  item.location = (row.location as Location | null | undefined) ?? 'unknown';
  item.edition_type = (row.edition_type as EditionType | null | undefined) ?? 'none';
  item.edition_label = row.edition_label ?? null;
  item.physical_location = parsePhysicalLocations(row.physical_location);
  item.box_type = (row.box_type as BoxType | null | undefined) ?? 'none';
  item.download_url = row.download_url ?? null;
  item.dumped = Boolean(row.dumped);
  item.dumped_ignored = Boolean(row.dumped_ignored);
  item.custom_description = row.custom_description ?? null;
  item.added_at = row.added_at;
  item.updated_at = row.updated_at;
  return item;
}
