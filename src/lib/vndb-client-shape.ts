import { asJsonRecord } from './json-shape';
import { decodeVndbResultsEnvelope, type VndbResultsEnvelope } from './vndb-response-shape';
import { isVndbVnId } from './vn-id-shape';
import type {
  VndbAuthInfo,
  VndbStatsGlobal,
  VndbUlistEntry,
  VndbUlistEntryDetail,
  VndbUlistLabel,
  VndbUserInfo,
} from './vndb';

type Decoder<T> = (value: unknown) => T | null;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeNullableImage(value: unknown): { url: string; thumbnail: string | null } | null | undefined {
  if (value === null) return null;
  const record = asJsonRecord(value);
  if (!record || !isString(record.url) || !isNullableString(record.thumbnail)) return undefined;
  return { url: record.url, thumbnail: record.thumbnail };
}

function decodeUlistLabels(value: unknown): { id: number; label: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((label) => {
    const record = asJsonRecord(label);
    return record && isNonNegativeInteger(record.id) && isString(record.label)
      ? [{ id: record.id, label: record.label }]
      : [];
  });
}

/**
 * Lightweight VN row used by the paginated staff-credit lookup.
 */
export interface VndbStaffCreditListRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  image: { url: string; thumbnail: string | null } | null;
  staff: { id: string; role: string; note: string | null }[];
}

/**
 * Lightweight VN row used by the paginated voice-credit lookup.
 */
export interface VndbVaCreditListRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  image: { url: string; thumbnail: string | null } | null;
  va: {
    staff: { id: string };
    note: string | null;
    character: { id: string; name: string; original: string | null; image: { url: string } | null };
  }[];
}

/**
 * Build a VNDB list-envelope decoder that omits malformed endpoint rows.
 *
 * @param decodeRow Structural decoder for one endpoint row.
 * @returns A cache lifecycle decoder for the normalized list envelope.
 */
export function createVndbResultsEnvelopeDecoder<T>(decodeRow: Decoder<T>): Decoder<VndbResultsEnvelope<T>> {
  return (value) => {
    const envelope = decodeVndbResultsEnvelope(value);
    if (!envelope) return null;
    return {
      ...envelope,
      results: envelope.results.flatMap((row) => decodeRow(row) ?? []),
    };
  };
}

/**
 * Decode one lightweight staff-credit VN row.
 *
 * @param value Parsed VNDB row.
 * @returns A normalized row, or `null` when required fields are malformed.
 */
export function decodeVndbStaffCreditListRow(value: unknown): VndbStaffCreditListRow | null {
  const record = asJsonRecord(value);
  const image = record ? decodeNullableImage(record.image) : undefined;
  if (
    !record ||
    !isString(record.id) ||
    !isVndbVnId(record.id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.released) ||
    !isNullableNumber(record.rating) ||
    image === undefined ||
    !Array.isArray(record.staff)
  ) {
    return null;
  }
  const staff = record.staff.flatMap((credit) => {
    const item = asJsonRecord(credit);
    const id = item?.id;
    return item && isString(id) && /^s\d+$/i.test(id) && isString(item.role) && isNullableString(item.note)
      ? [{ id: id.toLowerCase(), role: item.role, note: item.note }]
      : [];
  });
  return {
    id: record.id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    rating: record.rating,
    image,
    staff,
  };
}

/**
 * Decode one lightweight VA-credit VN row.
 *
 * @param value Parsed VNDB row.
 * @returns A normalized row, or `null` when required fields are malformed.
 */
export function decodeVndbVaCreditListRow(value: unknown): VndbVaCreditListRow | null {
  const record = asJsonRecord(value);
  const image = record ? decodeNullableImage(record.image) : undefined;
  if (
    !record ||
    !isString(record.id) ||
    !isVndbVnId(record.id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.released) ||
    !isNullableNumber(record.rating) ||
    image === undefined ||
    !Array.isArray(record.va)
  ) {
    return null;
  }
  const va = record.va.flatMap((credit) => {
    const item = asJsonRecord(credit);
    const staff = asJsonRecord(item?.staff);
    const character = asJsonRecord(item?.character);
    const characterImage = character?.image === null
      ? null
      : asJsonRecord(character?.image);
    const characterImageUrl = characterImage && isString(characterImage.url)
      ? characterImage.url
      : null;
    const staffId = staff?.id;
    const characterId = character?.id;
    return item &&
      isString(staffId) &&
      /^s\d+$/i.test(staffId) &&
      isNullableString(item.note) &&
      isString(characterId) &&
      /^c\d+$/i.test(characterId) &&
      isString(character?.name) &&
      isNullableString(character.original) &&
      (characterImage === null || characterImageUrl !== null)
      ? [{
          staff: { id: staffId.toLowerCase() },
          note: item.note,
          character: {
            id: characterId.toLowerCase(),
            name: character.name,
            original: character.original,
            image: characterImageUrl !== null ? { url: characterImageUrl } : null,
          },
        }]
      : [];
  });
  return {
    id: record.id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    rating: record.rating,
    image,
    va,
  };
}

/**
 * Decode one VNDB user-list row used by wishlist and status sync surfaces.
 *
 * @param value Parsed VNDB row.
 * @returns A normalized row, or `null` when required fields are malformed.
 */
export function decodeVndbUlistEntryRow(value: unknown): VndbUlistEntry | null {
  const record = asJsonRecord(value);
  const vn = asJsonRecord(record?.vn);
  const labels = decodeUlistLabels(record?.labels);
  const languages = decodeStringArray(vn?.languages);
  const platforms = decodeStringArray(vn?.platforms);
  const image = vn?.image === null ? null : asJsonRecord(vn?.image);
  const imageUrl = image && isString(image.url) ? image.url : null;
  const imageThumbnail = image && isString(image.thumbnail) ? image.thumbnail : null;
  const imageSexual = image && isFiniteNumber(image.sexual) ? image.sexual : null;
  if (
    !record ||
    !isString(record.id) ||
    !isVndbVnId(record.id) ||
    !isNonNegativeInteger(record.added) ||
    !isNullableNumber(record.voted) ||
    !isNullableNumber(record.vote) ||
    !isNullableString(record.started) ||
    !isNullableString(record.finished) ||
    !isNullableString(record.notes) ||
    !labels ||
    !vn ||
    !isString(vn.title) ||
    !isNullableString(vn.alttitle) ||
    !isNullableString(vn.released) ||
    !isNullableNumber(vn.rating) ||
    !isNullableNumber(vn.votecount) ||
    !isNullableNumber(vn.length_minutes) ||
    !languages ||
    !platforms ||
    !Array.isArray(vn.developers) ||
    !(image === null || (imageUrl !== null && imageThumbnail !== null)) ||
    !(image === null || image.sexual === undefined || isFiniteNumber(image.sexual))
  ) {
    return null;
  }
  const developers = vn.developers.flatMap((developer) => {
    const item = asJsonRecord(developer);
    const id = item?.id;
    return item && isString(id) && /^p\d+$/i.test(id) && isString(item.name)
      ? [{ id: id.toLowerCase(), name: item.name }]
      : [];
  });
  return {
    id: record.id.toLowerCase(),
    added: record.added,
    voted: record.voted,
    vote: record.vote,
    started: record.started,
    finished: record.finished,
    notes: record.notes,
    labels,
    vn: {
      id: record.id.toLowerCase(),
      title: vn.title,
      alttitle: vn.alttitle,
      released: vn.released,
      rating: vn.rating,
      votecount: vn.votecount,
      length_minutes: vn.length_minutes,
      languages,
      platforms,
      image: imageUrl !== null && imageThumbnail !== null ? {
        url: imageUrl,
        thumbnail: imageThumbnail,
        ...(imageSexual !== null ? { sexual: imageSexual } : {}),
      } : null,
      developers,
    },
  };
}

/**
 * Decode one VNDB user-list detail row.
 *
 * @param value Parsed VNDB row.
 * @returns A normalized row, or `null` when required fields are malformed.
 */
export function decodeVndbUlistEntryDetailRow(value: unknown): VndbUlistEntryDetail | null {
  const record = asJsonRecord(value);
  const labels = decodeUlistLabels(record?.labels);
  if (
    !record ||
    !isString(record.id) ||
    !isVndbVnId(record.id) ||
    !isNonNegativeInteger(record.added) ||
    !isNullableNumber(record.voted) ||
    !isNonNegativeInteger(record.lastmod) ||
    !isNullableNumber(record.vote) ||
    !isNullableString(record.started) ||
    !isNullableString(record.finished) ||
    !isNullableString(record.notes) ||
    !labels
  ) {
    return null;
  }
  return {
    id: record.id.toLowerCase(),
    added: record.added,
    voted: record.voted,
    lastmod: record.lastmod,
    vote: record.vote,
    started: record.started,
    finished: record.finished,
    notes: record.notes,
    labels,
  };
}

/**
 * Decode the VNDB ulist-label response.
 *
 * @param value Parsed VNDB response.
 * @returns Safe labels, or `null` for a malformed response envelope.
 */
export function decodeVndbUlistLabelsResponse(value: unknown): { labels: VndbUlistLabel[] } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.labels)) return null;
  const labels = record.labels.flatMap((label) => {
    const item = asJsonRecord(label);
    return item &&
      isNonNegativeInteger(item.id) &&
      isString(item.label) &&
      typeof item.private === 'boolean' &&
      (item.count === undefined || isNonNegativeInteger(item.count))
      ? [{
          id: item.id,
          label: item.label,
          private: item.private,
          ...(item.count !== undefined ? { count: item.count } : {}),
        }]
      : [];
  });
  return { labels };
}

/**
 * Decode VNDB global counters.
 *
 * @param value Parsed VNDB response.
 * @returns Safe counters, or `null` for malformed input.
 */
export function decodeVndbStatsGlobal(value: unknown): VndbStatsGlobal | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isNonNegativeInteger(record.chars) ||
    !isNonNegativeInteger(record.producers) ||
    !isNonNegativeInteger(record.releases) ||
    !isNonNegativeInteger(record.staff) ||
    !isNonNegativeInteger(record.tags) ||
    !isNonNegativeInteger(record.traits) ||
    !isNonNegativeInteger(record.vn)
  ) {
    return null;
  }
  return {
    chars: record.chars,
    producers: record.producers,
    releases: record.releases,
    staff: record.staff,
    tags: record.tags,
    traits: record.traits,
    vn: record.vn,
  };
}

/**
 * Decode VNDB authentication metadata.
 *
 * @param value Parsed VNDB response.
 * @returns Safe authentication metadata, or `null` for malformed input.
 */
export function decodeVndbAuthInfo(value: unknown): VndbAuthInfo | null {
  const record = asJsonRecord(value);
  const permissions = decodeStringArray(record?.permissions);
  if (!record || !isString(record.id) || !isString(record.username) || !permissions) return null;
  return { id: record.id, username: record.username, permissions };
}

function decodeVndbUserInfo(value: unknown): VndbUserInfo | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.id) ||
    !isString(record.username) ||
    !(record.lengthvotes === undefined || isNonNegativeInteger(record.lengthvotes)) ||
    !(record.lengthvotes_sum === undefined || isNonNegativeInteger(record.lengthvotes_sum))
  ) {
    return null;
  }
  return {
    id: record.id,
    username: record.username,
    ...(record.lengthvotes !== undefined ? { lengthvotes: record.lengthvotes } : {}),
    ...(record.lengthvotes_sum !== undefined ? { lengthvotes_sum: record.lengthvotes_sum } : {}),
  };
}

/**
 * Decode a VNDB bulk-user lookup response.
 *
 * @param value Parsed VNDB response.
 * @returns Safe lookup entries, or `null` when any returned row is malformed.
 */
export function decodeVndbUserLookup(value: unknown): Record<string, VndbUserInfo | null> | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const out: Record<string, VndbUserInfo | null> = {};
  for (const [query, row] of Object.entries(record)) {
    if (row === null) {
      out[query] = null;
      continue;
    }
    const user = decodeVndbUserInfo(row);
    if (!user) return null;
    out[query] = user;
  }
  return out;
}
