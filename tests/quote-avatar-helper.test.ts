/**
 * Helper-level tests for the quote avatar resolution rules. The
 * helper is consumed by three different rendering surfaces
 * (`QuotesSection`, `QuoteFooter`, the `/quotes` server page),
 * each shaped slightly differently. The tests pin both:
 *   - the flat shape returned by `listAllQuotes`
 *     (`character_id` + `character_local_image` flat fields), and
 *   - the nested shape used by the VNDB-derived feed
 *     (`character.id` + `character.image.local_path`).
 *
 * No React Testing Library in this project — we exercise the pure
 * helper directly so the test runs under the existing
 * `environment: 'node'` config.
 */
import { describe, expect, it } from 'vitest';
import { quoteAvatarSrc, quoteCharacterHref } from '@/lib/quote-avatar';

describe('quoteAvatarSrc', () => {
  it('returns the /api/files path when the flat row carries a character + local image', () => {
    const got = quoteAvatarSrc({
      character_id: 'c12345',
      character_local_image: 'character/c12345.jpg',
    });
    expect(got).toBe('/api/files/character/c12345.jpg');
  });

  it('returns the /api/files path when the nested VNDB shape carries an image', () => {
    const got = quoteAvatarSrc({
      character: {
        id: 'c98',
        image: { local_path: 'character/c98.webp' },
      },
    });
    expect(got).toBe('/api/files/character/c98.webp');
  });

  it('returns null when the row has a character id but no downloaded image', () => {
    expect(
      quoteAvatarSrc({
        character_id: 'c1',
        character_local_image: null,
      }),
    ).toBeNull();
    expect(
      quoteAvatarSrc({
        character: { id: 'c1', image: null },
      }),
    ).toBeNull();
    expect(
      quoteAvatarSrc({
        character: { id: 'c1', image: { local_path: null } },
      }),
    ).toBeNull();
  });

  it('returns null when no character id is attached to the quote', () => {
    expect(
      quoteAvatarSrc({
        character_id: null,
        character_local_image: 'character/orphan.jpg',
      }),
    ).toBeNull();
    expect(quoteAvatarSrc({ character: null })).toBeNull();
    expect(quoteAvatarSrc(null)).toBeNull();
    expect(quoteAvatarSrc(undefined)).toBeNull();
  });

  it('prefers the flat field when both shapes coexist (the JOIN wins over the nested payload)', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      character_local_image: 'character/flat.jpg',
      character: {
        id: 'c1',
        image: { local_path: 'character/nested.jpg' },
      },
    });
    // The flat path is the cheaper SQL JOIN — the helper trusts
    // it when present, even when the nested copy disagrees.
    expect(got).toBe('/api/files/character/flat.jpg');
  });
});

describe('quoteCharacterHref', () => {
  it('returns the /character/<id> route when a character id is present (flat shape)', () => {
    expect(
      quoteCharacterHref({ character_id: 'c42', character_local_image: null }),
    ).toBe('/character/c42');
  });

  it('returns the /character/<id> route when a character id is present (nested shape)', () => {
    expect(quoteCharacterHref({ character: { id: 'c77', image: null } })).toBe(
      '/character/c77',
    );
  });

  it('returns null when the quote has no character id', () => {
    expect(quoteCharacterHref({ character_id: null })).toBeNull();
    expect(quoteCharacterHref({ character: null })).toBeNull();
    expect(quoteCharacterHref(null)).toBeNull();
  });
});
