/**
 * R5-137 pin: `WishlistClient` uses the stable-callback / ref
 * pattern that `LibraryClient` already uses, so sibling state
 * ticks (search query, sort change, group change) don't defeat
 * `React.memo(VnCard)` and re-render every wishlist card.
 *
 * Specifically:
 *   - The per-card callbacks (`toggleSelected`, `handleAdded`,
 *     `removeOne`) are wrapped in `useCallback` with stable
 *     deps (functional `setState` for the items / selected sets).
 *   - The grid renders a memoized `MemoWishlistCard` wrapper that
 *     creates the per-card arrow inside its own `useCallback` —
 *     the same MemoCard pattern as LibraryClient.
 *   - `removingId` is read via a ref inside `removeOne` so the
 *     callback identity doesn't change while a delete is in
 *     flight.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/WishlistClient.tsx'),
  'utf8',
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

describe('WishlistClient — R5-137 stable callbacks', () => {
  const code = stripComments(SOURCE);

  it('imports memo, useCallback, useRef from react', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bmemo\b[^}]*\}\s*from\s*['"]react['"]/);
    expect(code).toMatch(/import\s*\{[^}]*\buseCallback\b[^}]*\}\s*from\s*['"]react['"]/);
    expect(code).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('toggleSelected is a useCallback (not a plain function declaration)', () => {
    // Plain `function toggleSelected(...)` form must be gone.
    expect(code).not.toMatch(/function\s+toggleSelected\s*\(/);
    expect(code).toMatch(/toggleSelected\s*=\s*useCallback\s*\(/);
  });

  it('clearSelection + handleAdded + removeOne are useCallbacks', () => {
    expect(code).toMatch(/clearSelection\s*=\s*useCallback\s*\(/);
    expect(code).toMatch(/handleAdded\s*=\s*useCallback\s*\(/);
    expect(code).toMatch(/removeOne\s*=\s*useCallback\s*\(/);
  });

  it('removingId is read through a useRef inside removeOne', () => {
    expect(code).toMatch(/removingIdRef\s*=\s*useRef\(/);
  });

  it('grid renders a memoized MemoWishlistCard wrapper', () => {
    expect(code).toMatch(/MemoWishlistCard\s*=\s*memo\(/);
    expect(code).toMatch(/<MemoWishlistCard\b/);
  });

  it('no per-render inline arrows passed to MemoWishlistCard / VnCard for onSelect / onAdded', () => {
    // The old shape had `onSelect={() => toggleSelected(it.vn.id)}`
    // and `onAdded={(id) => setItems(...)}`. After the refactor,
    // the JSX passes the bare stable callback references, and the
    // per-card closure is created inside the memo wrapper.
    expect(code).not.toMatch(/onSelect=\{\(\)\s*=>\s*toggleSelected\(/);
    expect(code).not.toMatch(/onAdded=\{\(id\)\s*=>\s*setItems\(/);
  });
});
