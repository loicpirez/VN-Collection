import { describe, expect, it } from 'vitest';
import {
  decodePersistedProducerSummaries,
  isPersistedEditions,
  isPersistedProducerSummaries,
  isPersistedRelations,
  isPersistedScreenshots,
  isPersistedStaff,
  isPersistedStringArray,
  isPersistedTags,
  isPersistedTitles,
  isPersistedVa,
} from '@/lib/vn-persisted-json-shape';

describe('persisted VN JSON column guards', () => {
  it('accepts representative stored rows', () => {
    expect(isPersistedStringArray(['ja', 'en'])).toBe(true);
    expect(isPersistedProducerSummaries([{ id: 'p90001', name: 'Studio' }])).toBe(true);
    expect(isPersistedTags([{ id: 'g90001', name: 'Tag', rating: 3, spoiler: 0, lie: false, category: 'cont' }])).toBe(true);
    expect(isPersistedScreenshots([{ url: 'https://example.invalid/a.jpg', thumbnail: 'https://example.invalid/t.jpg', release: { id: 'r90001' } }])).toBe(true);
    expect(isPersistedRelations([{
      id: 'v90002',
      title: 'Related',
      alttitle: null,
      released: null,
      rating: null,
      votecount: null,
      length_minutes: null,
      languages: [],
      platforms: [],
      developers: [],
      image_url: null,
      image_thumb: null,
      image_sexual: null,
      relation: 'seq',
      relation_official: true,
    }])).toBe(true);
    expect(isPersistedTitles([{ lang: 'ja', title: 'Fixture', latin: null, official: true, main: true }])).toBe(true);
    expect(isPersistedEditions([{ eid: 1, lang: null, name: 'Edition', official: true }])).toBe(true);
    expect(isPersistedStaff([{ eid: null, role: 'scenario', note: null, id: 's90001', aid: 1, name: 'Staff', original: null, lang: 'ja' }])).toBe(true);
    expect(isPersistedVa([{ note: null, character: { id: 'c90001', name: 'Character', original: null }, staff: { id: 's90001', aid: 1, name: 'Staff', original: null, lang: 'ja' } }])).toBe(true);
  });

  it('rejects parseable malformed rows and oversized arrays', () => {
    expect(isPersistedStringArray(['ja', 2])).toBe(false);
    expect(isPersistedStringArray(Array.from({ length: 5001 }, () => 'ja'))).toBe(false);
    expect(isPersistedProducerSummaries([{ id: 'bad', name: 'Studio' }])).toBe(false);
    expect(isPersistedTags([{ id: 'g90001', name: 'Tag', rating: '3', spoiler: 0 }])).toBe(false);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', release: { id: 'bad' } }])).toBe(false);
    expect(isPersistedRelations([{ id: 'v90002', title: 'Related' }])).toBe(false);
    expect(isPersistedRelations([{
      id: 'v90002',
      title: 'Related',
      alttitle: null,
      released: null,
      rating: null,
      votecount: null,
      length_minutes: null,
      languages: [],
      platforms: [],
      developers: [],
      publishers: [{ id: 'bad', name: 'Publisher' }],
      image_url: null,
      image_thumb: null,
      image_sexual: null,
      relation: 'seq',
      relation_official: true,
    }])).toBe(false);
    expect(isPersistedTitles([{ lang: 'ja', title: 'Fixture' }])).toBe(false);
    expect(isPersistedEditions([{ eid: 1, lang: null, name: 'Edition' }])).toBe(false);
    expect(isPersistedStaff([{ id: 's90001', name: 'Staff' }])).toBe(false);
    expect(isPersistedVa([{ note: null, character: { id: 'bad' }, staff: {} }])).toBe(false);
  });

  it('decodes producer summaries with an empty fallback for malformed storage', () => {
    expect(decodePersistedProducerSummaries(JSON.stringify([{ id: 'p90001', name: 'Studio' }]))).toEqual([
      { id: 'p90001', name: 'Studio' },
    ]);
    expect(decodePersistedProducerSummaries(JSON.stringify({ id: 'p90001', name: 'Studio' }))).toEqual([]);
    expect(decodePersistedProducerSummaries(JSON.stringify([{ id: 'bad', name: 'Studio' }]))).toEqual([]);
  });
});
