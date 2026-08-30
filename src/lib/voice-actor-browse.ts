import type { VoiceActorBrowseOptions, VoiceActorSort } from '@/lib/db/repositories/voice-actors';

/** Fixed credit thresholds exposed by the seiyuu browser. */
export const VOICE_ACTOR_MINIMUMS = [1, 5, 10, 25, 50] as const;

/** Fixed page size used by the server-rendered seiyuu ranking. */
export const VOICE_ACTOR_PAGE_SIZE = 48;

const SORTS: readonly VoiceActorSort[] = ['vns', 'collection', 'characters', 'recent', 'name'];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function defaultDirection(sort: VoiceActorSort): 'asc' | 'desc' {
  return sort === 'name' ? 'asc' : 'desc';
}

/** Parse and bound URL state for the dedicated local seiyuu index. */
export function parseVoiceActorBrowseParams(
  searchParams: Record<string, string | string[] | undefined>,
): VoiceActorBrowseOptions {
  const query = (first(searchParams.q) ?? '').trim().slice(0, 100);
  const languageValue = first(searchParams.lang) ?? '';
  const language = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(languageValue)
    ? languageValue
    : null;
  const scope = first(searchParams.scope) === 'collection' ? 'collection' : 'all';
  const sortValue = first(searchParams.sort);
  const sort = SORTS.includes(sortValue as VoiceActorSort) ? sortValue as VoiceActorSort : 'vns';
  const directionValue = first(searchParams.direction);
  const direction = directionValue === 'asc' || directionValue === 'desc'
    ? directionValue
    : defaultDirection(sort);
  const minimumValue = Number(first(searchParams.minimum));
  const minimumVns = VOICE_ACTOR_MINIMUMS.includes(minimumValue as typeof VOICE_ACTOR_MINIMUMS[number])
    ? minimumValue
    : 1;
  const pageValue = Number(first(searchParams.page));
  const page = Number.isSafeInteger(pageValue) && pageValue > 0
    ? Math.min(pageValue, 100_000)
    : 1;
  return {
    query,
    language,
    scope,
    sort,
    direction,
    minimumVns,
    page,
    pageSize: VOICE_ACTOR_PAGE_SIZE,
  };
}

/** Build one canonical seiyuu URL while omitting default query values. */
export function voiceActorBrowseHref(options: VoiceActorBrowseOptions): string {
  const params = new URLSearchParams();
  if (options.query) params.set('q', options.query);
  if (options.language) params.set('lang', options.language);
  if (options.scope === 'collection') params.set('scope', 'collection');
  if (options.sort !== 'vns') params.set('sort', options.sort);
  if (options.direction !== defaultDirection(options.sort)) params.set('direction', options.direction);
  if (options.minimumVns !== 1) params.set('minimum', String(options.minimumVns));
  if (options.page > 1) params.set('page', String(options.page));
  const query = params.toString();
  return query ? `/seiyuu?${query}` : '/seiyuu';
}
