import { describe, expect, it } from 'vitest';
import {
  parseVoiceActorBrowseParams,
  VOICE_ACTOR_PAGE_SIZE,
  voiceActorBrowseHref,
} from '@/lib/voice-actor-browse';

describe('voice actor browse URL state', () => {
  it('returns bounded defaults for missing or invalid values', () => {
    expect(parseVoiceActorBrowseParams({
      q: '   ',
      lang: 'not a language',
      scope: 'remote',
      sort: 'score',
      direction: 'sideways',
      minimum: '3',
      page: '-2',
    })).toEqual({
      query: '',
      language: null,
      scope: 'all',
      sort: 'vns',
      direction: 'desc',
      minimumVns: 1,
      page: 1,
      pageSize: VOICE_ACTOR_PAGE_SIZE,
    });
  });

  it('accepts array parameters, trims the query, and caps the page and query', () => {
    const query = `  ${'a'.repeat(120)}  `;
    expect(parseVoiceActorBrowseParams({
      q: [query, 'ignored'],
      lang: ['ja-JP', 'en'],
      scope: ['collection'],
      sort: ['name'],
      direction: ['desc'],
      minimum: ['25'],
      page: ['999999'],
    })).toEqual({
      query: 'a'.repeat(100),
      language: 'ja-JP',
      scope: 'collection',
      sort: 'name',
      direction: 'desc',
      minimumVns: 25,
      page: 100_000,
      pageSize: VOICE_ACTOR_PAGE_SIZE,
    });
  });

  it('uses ascending name order and validates every supported sort', () => {
    for (const sort of ['collection', 'characters', 'recent', 'name'] as const) {
      const parsed = parseVoiceActorBrowseParams({ sort });
      expect(parsed.sort).toBe(sort);
      expect(parsed.direction).toBe(sort === 'name' ? 'asc' : 'desc');
    }
    expect(parseVoiceActorBrowseParams({ page: '1.5' }).page).toBe(1);
    expect(parseVoiceActorBrowseParams({ page: 'NaN' }).page).toBe(1);
  });

  it('omits defaults and serializes non-default state canonically', () => {
    const defaults = parseVoiceActorBrowseParams({});
    expect(voiceActorBrowseHref(defaults)).toBe('/seiyuu');

    expect(voiceActorBrowseHref({
      ...defaults,
      query: 'voice alias',
      language: 'ja',
      scope: 'collection',
      sort: 'name',
      direction: 'desc',
      minimumVns: 10,
      page: 3,
    })).toBe('/seiyuu?q=voice+alias&lang=ja&scope=collection&sort=name&direction=desc&minimum=10&page=3');

    expect(voiceActorBrowseHref({ ...defaults, sort: 'name', direction: 'asc' })).toBe('/seiyuu?sort=name');
    expect(voiceActorBrowseHref({ ...defaults, direction: 'asc' })).toBe('/seiyuu?direction=asc');
  });
});
