import { describe, expect, it } from 'vitest';
import {
  decodePersistedProducerSummaries,
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

  it('accepts and rejects optional screenshot, release-image, tag, and external-link fields', () => {
    expect(isPersistedScreenshots([{
      id: 'sf90001',
      url: 'https://example.invalid/a.jpg',
      thumbnail: 'https://example.invalid/t.jpg',
      sexual: 1,
      violence: 0,
      dims: [1920, 1080],
      release: null,
      local: null,
      local_thumb: '/local/t.jpg',
    }])).toBe(true);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', dims: [1920] }])).toBe(false);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', sexual: 'bad' }])).toBe(false);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', violence: 'bad' }])).toBe(false);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', local: 1 }])).toBe(false);
    expect(isPersistedScreenshots([{ url: 'x', thumbnail: 'y', local_thumb: 1 }])).toBe(false);

    const releaseImage = {
      id: 'cv90001',
      release_id: 'r90001',
      release_title: 'Edition',
      type: 'pkgfront',
      url: 'https://example.invalid/cover.jpg',
      thumbnail: null,
      dims: [800, 1200],
      sexual: 0,
      violence: 0,
      languages: ['ja'],
      photo: false,
      local: null,
      local_thumb: '/local/cover.jpg',
    };
    expect(isPersistedReleaseImages([releaseImage])).toBe(true);
    for (const patch of [
      { id: 1 },
      { release_id: 'bad' },
      { release_title: 1 },
      { type: 'bad' },
      { url: 1 },
      { thumbnail: 1 },
      { dims: [800] },
      { sexual: 'bad' },
      { violence: 'bad' },
      { languages: [1] },
      { photo: 'bad' },
      { local: 1 },
      { local_thumb: 1 },
    ]) {
      expect(isPersistedReleaseImages([{ ...releaseImage, ...patch }])).toBe(false);
    }

    expect(isPersistedExtlinks([{ url: 'https://example.invalid', label: 'Site', name: 'site' }])).toBe(true);
    expect(isPersistedExtlinks([{ url: 1, label: 'Site', name: 'site' }])).toBe(false);
    expect(isPersistedExtlinks([{ url: 'x', label: 1, name: 'site' }])).toBe(false);
    expect(isPersistedExtlinks([{ url: 'x', label: 'Site', name: 1 }])).toBe(false);

    for (const category of [undefined, null, 'ero', 'tech']) {
      expect(isPersistedTags([{ id: 'g90002', name: 'Tag', rating: 1, spoiler: 0, category }])).toBe(true);
    }
    expect(isPersistedTags([{ id: 'g90002', name: 'Tag', rating: 1, spoiler: 0, lie: 'bad' }])).toBe(false);
    expect(isPersistedTags([{ id: 'g90002', name: 'Tag', rating: 1, spoiler: 0, category: 'bad' }])).toBe(false);
  });

  it('validates relation developer variants and VA image variants', () => {
    const relation = {
      id: 'v90002',
      title: 'Related',
      alttitle: null,
      released: null,
      rating: null,
      votecount: null,
      length_minutes: null,
      languages: [],
      platforms: [],
      developers: [{ name: 'Studio without id' }],
      publishers: [{ id: 'p90001', name: 'Publisher' }],
      image_url: null,
      image_thumb: null,
      image_sexual: null,
      relation: 'seq',
      relation_official: true,
    };
    expect(isPersistedRelations([relation])).toBe(true);
    expect(isPersistedRelations([{ ...relation, rating: 80 }])).toBe(true);
    expect(isPersistedRelations([{ ...relation, developers: [{ id: 1, name: 'Bad' }] }])).toBe(false);
    expect(isPersistedRelations([{ ...relation, developers: [{ id: 'p90001', name: 1 }] }])).toBe(false);

    expect(isPersistedVa([{
      note: null,
      character: { id: 'c90001', name: 'Character', original: null, image: null },
      staff: { id: 's90001', aid: 1, name: 'Staff', original: null, lang: 'ja' },
    }])).toBe(true);
    expect(isPersistedVa([{
      note: null,
      character: { id: 'c90001', name: 'Character', original: null, image: { url: 'https://example.invalid/c.jpg' } },
      staff: { id: 's90001', aid: 1, name: 'Staff', original: null, lang: 'ja' },
    }])).toBe(true);
    expect(isPersistedVa([{
      note: null,
      character: { id: 'c90001', name: 'Character', original: null, image: { url: 1 } },
      staff: { id: 's90001', aid: 1, name: 'Staff', original: null, lang: 'ja' },
    }])).toBe(false);
  });
});
