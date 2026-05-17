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
 * The fallback chain is also pinned here:
 *   1. character portrait
 *   2. VN cover (local thumb → local full → remote URL)
 *   3. null (consumer renders `<UserCircle>`)
 *
 * No React Testing Library in this project — we exercise the pure
 * helper directly so the test runs under the existing
 * `environment: 'node'` config.
 */
import { describe, expect, it } from 'vitest';
import { quoteAvatarSrc, quoteCharacterHref, resolveQuoteAvatar } from '@/lib/quote-avatar';

describe('quoteAvatarSrc — character portrait tier', () => {
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

  it('prefers the flat field when both shapes coexist (the JOIN wins over the nested payload)', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      character_local_image: 'character/flat.jpg',
      character: {
        id: 'c1',
        image: { local_path: 'character/nested.jpg' },
      },
    });
    expect(got).toBe('/api/files/character/flat.jpg');
  });
});

describe('quoteAvatarSrc — VN cover fallback tier', () => {
  it('falls back to vn_local_image_thumb when no character image is available', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      character_local_image: null,
      vn_local_image_thumb: 'vn/abc-thumb.jpg',
      vn_local_image: 'vn/abc.jpg',
    });
    // Thumb preferred over full-size when both exist.
    expect(got).toBe('/api/files/vn/abc-thumb.jpg');
  });

  it('falls back to vn_local_image when no thumb is available', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      vn_local_image: 'vn/abc.jpg',
    });
    expect(got).toBe('/api/files/vn/abc.jpg');
  });

  it('falls back to nested vn.image_thumb URL when no local mirror is present', () => {
    const got = quoteAvatarSrc({
      vn: { id: 'v1', image_thumb: 'https://t.vndb.org/cv/1.jpg', image_url: 'https://t.vndb.org/cv/1-full.jpg' },
    });
    // Remote thumb URL — left as-is (no /api/files/ prefix).
    expect(got).toBe('https://t.vndb.org/cv/1.jpg');
  });

  it('falls back to vn_image_url remote URL when nothing local is available', () => {
    const got = quoteAvatarSrc({
      vn_image_url: 'https://t.vndb.org/cv/2.jpg',
    });
    expect(got).toBe('https://t.vndb.org/cv/2.jpg');
  });

  it('uses the VN cover when the row has a character id but no downloaded character image', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      character_local_image: null,
      vn_local_image_thumb: 'vn/fallback.jpg',
    });
    expect(got).toBe('/api/files/vn/fallback.jpg');
  });

  it('uses the VN cover when the quote has no character id at all', () => {
    const got = quoteAvatarSrc({
      vn_local_image: 'vn/no-char.jpg',
    });
    expect(got).toBe('/api/files/vn/no-char.jpg');
  });

  it('character image still beats the VN cover when both are available', () => {
    const got = quoteAvatarSrc({
      character_id: 'c1',
      character_local_image: 'character/c1.jpg',
      vn_local_image_thumb: 'vn/cover.jpg',
    });
    expect(got).toBe('/api/files/character/c1.jpg');
  });
});

describe('quoteAvatarSrc — null tier (UserCircle fallback)', () => {
  it('returns null when neither a character image nor a VN cover is available', () => {
    expect(
      quoteAvatarSrc({
        character_id: 'c1',
        character_local_image: null,
      }),
    ).toBeNull();
    expect(quoteAvatarSrc({ character: null })).toBeNull();
    expect(quoteAvatarSrc(null)).toBeNull();
    expect(quoteAvatarSrc(undefined)).toBeNull();
  });
});

describe('resolveQuoteAvatar — discriminated result', () => {
  it('returns kind="character" when a portrait is available', () => {
    const r = resolveQuoteAvatar({
      character_id: 'c1',
      character_local_image: 'character/c1.jpg',
    });
    expect(r.kind).toBe('character');
    expect(r.src).toBe('/api/files/character/c1.jpg');
  });

  it('returns kind="vnCover" when only a VN cover is available', () => {
    const r = resolveQuoteAvatar({
      vn_local_image_thumb: 'vn/cover.jpg',
    });
    expect(r.kind).toBe('vnCover');
    expect(r.src).toBe('/api/files/vn/cover.jpg');
  });

  it('returns kind="none" when nothing is available', () => {
    const r = resolveQuoteAvatar({ character: null });
    expect(r.kind).toBe('none');
    expect(r.src).toBeNull();
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
