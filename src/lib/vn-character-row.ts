import type { VndbCharacter, VndbCharacterVn } from './vndb-types';

/** Character row returned by the local VN characters API after image enrichment. */
export type VnCharacterRow = VndbCharacter & { localImage: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringPairOrNull(value: unknown): [string | null, string | null] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  return [stringOrNull(value[0]), stringOrNull(value[1])];
}

function numberPairOrNull(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const first = numberOrNull(value[0]);
  const second = numberOrNull(value[1]);
  return first === null || second === null ? null : [first, second];
}

function mapCharacterVn(value: unknown): VndbCharacterVn | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const role =
    value.role === 'main' || value.role === 'primary' || value.role === 'side' || value.role === 'appears'
      ? value.role
      : 'appears';
  const image =
    isRecord(value.image) && typeof value.image.url === 'string'
      ? {
          url: value.image.url,
          thumbnail: stringOrNull(value.image.thumbnail) ?? undefined,
          sexual: numberOrNull(value.image.sexual) ?? undefined,
        }
      : null;
  return {
    id: value.id,
    role,
    spoiler: numberOrNull(value.spoiler) ?? 0,
    title: stringOrNull(value.title) ?? undefined,
    alttitle: stringOrNull(value.alttitle),
    released: stringOrNull(value.released),
    image,
    rating: numberOrNull(value.rating),
  };
}

function mapCharacterRow(value: unknown): VnCharacterRow | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  const image =
    isRecord(value.image) && typeof value.image.url === 'string'
      ? {
          url: value.image.url,
          dims: numberPairOrNull(value.image.dims) ?? undefined,
          sexual: numberOrNull(value.image.sexual) ?? undefined,
          violence: numberOrNull(value.image.violence) ?? undefined,
        }
      : null;
  const traits = Array.isArray(value.traits)
    ? value.traits.flatMap((trait) => {
        if (!isRecord(trait) || typeof trait.id !== 'string') return [];
        return [{
          id: trait.id,
          name: stringOrNull(trait.name) ?? '',
          group_name: stringOrNull(trait.group_name) ?? '',
          spoiler: numberOrNull(trait.spoiler) ?? 0,
          sexual: typeof trait.sexual === 'boolean' ? trait.sexual : false,
          ...(typeof trait.lie === 'boolean' ? { lie: trait.lie } : {}),
        }];
      })
    : [];
  return {
    id: value.id,
    name: value.name,
    original: stringOrNull(value.original),
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
    description: stringOrNull(value.description),
    image,
    blood_type: stringOrNull(value.blood_type),
    height: numberOrNull(value.height),
    weight: numberOrNull(value.weight),
    bust: numberOrNull(value.bust),
    waist: numberOrNull(value.waist),
    hips: numberOrNull(value.hips),
    cup: stringOrNull(value.cup),
    age: numberOrNull(value.age),
    birthday: numberPairOrNull(value.birthday),
    sex: stringPairOrNull(value.sex),
    gender: stringPairOrNull(value.gender),
    vns: Array.isArray(value.vns) ? value.vns.flatMap((vn) => mapCharacterVn(vn) ?? []) : [],
    traits,
    localImage: stringOrNull(value.localImage),
  };
}

function mapCharacterRows(value: unknown): VnCharacterRow[] | null {
  return Array.isArray(value)
    ? value.flatMap((character) => mapCharacterRow(character) ?? [])
    : null;
}

/**
 * Validate and normalize the local VN characters API payload.
 *
 * @param payload Parsed JSON returned by the local API.
 * @returns Safe character rows; malformed rows are omitted.
 */
export function readVnCharacterRows(payload: unknown): VnCharacterRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.characters)) return [];
  return mapCharacterRows(payload.characters) ?? [];
}

/**
 * Validate and normalize a direct VNDB character-cache envelope.
 *
 * @param payload Decoded VNDB cache payload.
 * @returns A safe character envelope, or `null` when the container is malformed.
 */
export function decodeVndbCharacterCacheResponse(payload: unknown): { results: VndbCharacter[] } | null {
  if (!isRecord(payload)) return null;
  const results = mapCharacterRows(payload.results);
  return results ? { results } : null;
}
