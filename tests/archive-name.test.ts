import { describe, expect, it } from 'vitest';
import { buildArchiveName, compareArchiveSource, type ArchiveNameSource } from '@/lib/archive-name';

function src(partial: Partial<ArchiveNameSource>): ArchiveNameSource {
  return {
    title: '',
    alttitle: null,
    released: null,
    developers: [],
    publishers: [],
    ...partial,
  };
}

describe('buildArchiveName', () => {
  it('prefers the original-language alttitle over the romaji title and takes the year', () => {
    expect(
      buildArchiveName(
        src({ title: 'Romaji Title', alttitle: 'カナタイトル', released: '2019-05-31', developers: [{ name: 'Studio X' }] }),
      ),
    ).toBe('Studio X - カナタイトル (2019)');
  });

  it('falls back to the romaji title when alttitle is null', () => {
    expect(
      buildArchiveName(
        src({ title: 'Latin Title', alttitle: null, released: '1997-05-23', developers: [{ name: 'Studio Y' }] }),
      ),
    ).toBe('Studio Y - Latin Title (1997)');
  });

  it('keeps fullwidth subtitle punctuation intact', () => {
    expect(
      buildArchiveName(
        src({ title: 'Romaji', alttitle: 'タイトル ～副題～', released: '2002-06-28', developers: [{ name: 'Studio Z' }] }),
      ),
    ).toBe('Studio Z - タイトル ～副題～ (2002)');
  });

  it('takes only the year from a YYYY-MM-DD release date', () => {
    expect(
      buildArchiveName(
        src({ title: 'Romaji', alttitle: 'かなかな', released: '2004-01-30', developers: [{ name: 'Studio W' }] }),
      ),
    ).toBe('Studio W - かなかな (2004)');
  });

  it('omits the year suffix when there is no usable release date', () => {
    expect(buildArchiveName(src({ title: 'Untitled', released: null, developers: [{ name: 'Brand' }] }))).toBe('Brand - Untitled');
    expect(buildArchiveName(src({ title: 'Untitled', released: 'TBA', developers: [{ name: 'Brand' }] }))).toBe('Brand - Untitled');
    expect(buildArchiveName(src({ title: 'Untitled', released: '0000-00-00', developers: [{ name: 'Brand' }] }))).toBe('Brand - Untitled');
  });

  it('drops the brand prefix when no developer or publisher is recorded', () => {
    expect(buildArchiveName(src({ title: 'Solo', released: '2010', developers: [] }))).toBe('Solo (2010)');
  });

  it('falls back to the publisher when there is no developer', () => {
    expect(
      buildArchiveName(src({ title: 'P', released: '2011', developers: [], publishers: [{ name: 'PubCo' }] })),
    ).toBe('PubCo - P (2011)');
  });

  it('replaces filesystem-illegal characters with a space', () => {
    expect(
      buildArchiveName(src({ title: 'Alpha/Beta', released: '2004', developers: [{ name: 'Studio Q' }] })),
    ).toBe('Studio Q - Alpha Beta (2004)');
  });

  it('skips blank developer entries to the first real one', () => {
    expect(
      buildArchiveName(src({ title: 'x', alttitle: 'タイトル', released: '2020', developers: [{ name: '  ' }, { name: 'Real' }] })),
    ).toBe('Real - タイトル (2020)');
  });

  it('accepts a missing publisher list and skips blank publisher entries', () => {
    expect(buildArchiveName(src({ title: 'Solo', publishers: undefined }))).toBe('Solo');
    expect(
      buildArchiveName(src({ title: 'P', publishers: [{ name: '  ' }, { name: 'PubCo' }] })),
    ).toBe('PubCo - P');
  });
});

describe('compareArchiveSource', () => {
  it('orders by brand then title', () => {
    const a = src({ title: 'Beta', developers: [{ name: 'AAA' }] });
    const b = src({ title: 'Alpha', developers: [{ name: 'BBB' }] });
    const c = src({ title: 'Alpha', developers: [{ name: 'AAA' }] });
    const sorted = [a, b, c].sort(compareArchiveSource).map(buildArchiveName);
    expect(sorted).toEqual(['AAA - Alpha', 'AAA - Beta', 'BBB - Alpha']);
  });
});
