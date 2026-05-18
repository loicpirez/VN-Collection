/**
 * R5-153 pin: every `<button>` / `<Link>` that hides its visible
 * label below a breakpoint via `hidden sm:inline` /
 * `hidden md:inline` / `hidden lg:inline` carries an
 * `aria-label` attribute so screen readers and touch keyboard
 * users still get an accessible name. `title=` alone is not
 * sufficient — `title` is not reliably announced and is
 * touch-hostile (no hover).
 *
 * The scan walks every interactive parent that contains the
 * stripped-label span and asserts the parent has `aria-label`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkSrc(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkSrc(p);
    else if (/\.(tsx?|jsx?)$/.test(entry)) yield p;
  }
}

const STRIPPED_LABEL_RE = /<span\b[^>]*className="[^"]*\bhidden\s+(?:sm|md|lg|xl):inline\b[^"]*"/g;

/**
 * Find the index of the `>` that closes a JSX opening tag that
 * STARTS at `tagStart` (a `<` character). Walks character-by-
 * character so it can:
 *   - Skip over `{…}` JSX expression containers (which may
 *     contain `>` from arrow functions `() =>`, comparators
 *     `a > b`, etc.).
 *   - Skip over `"…"` and `'…'` attribute string literals.
 * Returns the index of the closing `>`, or -1 if the tag is
 * malformed / open-ended.
 */
function findJsxOpenTagEnd(src: string, tagStart: number): number {
  let i = tagStart + 1;
  let brace = 0;
  let str: '"' | "'" | null = null;
  while (i < src.length) {
    const c = src[i];
    if (str) {
      if (c === '\\') { i += 2; continue; }
      if (c === str) { str = null; }
    } else if (c === '"' || c === '\'') {
      str = c;
    } else if (c === '{') {
      brace += 1;
    } else if (c === '}') {
      brace = Math.max(0, brace - 1);
    } else if (c === '>' && brace === 0) {
      return i;
    }
    i += 1;
  }
  return -1;
}

describe('R5-153 — every stripped-label span lives inside an aria-labelled parent', () => {
  it('no `<button>` / `<Link>` hides its label without an aria-label', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      const matches = src.matchAll(STRIPPED_LABEL_RE);
      for (const m of matches) {
        const upto = src.slice(0, m.index);
        const lastButton = upto.lastIndexOf('<button');
        const lastLink = Math.max(upto.lastIndexOf('<Link'), upto.lastIndexOf('<a '));
        const start = Math.max(lastButton, lastLink);
        if (start < 0) continue;
        const openTagEnd = findJsxOpenTagEnd(src, start);
        if (openTagEnd < 0 || openTagEnd > m.index) continue;
        const openTag = src.slice(start, openTagEnd + 1);
        if (!/\baria-label\s*=/.test(openTag)) {
          const before = src.slice(0, m.index);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
