/**
 * R5-151 pin: destructive / icon-only buttons meet the WCAG
 * 44×44 tap target AND have an accessible name.
 *
 * Scope: the two overlay "remove" controls on
 * `/lists/[id]` and `/series/[id]` cards were the most flagrant —
 * 28×28 px hit area (h-7 w-7) with no tap-target extension, AND
 * `md:opacity-0 md:group-hover:opacity-100` so the control is
 * hover-only on desktop. The hover-only piece is R5-150's
 * scope; this row covers the tap-target + label half:
 *
 *   - `<button class="tap-target …">` extends the hit area to
 *     ~48×48 via the `::after` pseudo-element from globals.css.
 *   - `aria-label={t.…removeFrom…}` is the accessible name.
 *
 * The sweep below is forward-looking: any future button class
 * string that contains `bg-status-dropped` (the destructive
 * background) MUST carry `aria-label=` somewhere in the
 * opening tag.
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

describe('R5-151 — destructive overlay controls have tap-target + aria-label', () => {
  it('SeriesRemoveVn carries tap-target + aria-label', () => {
    const src = readFileSync(join(ROOT, 'src/components/SeriesRemoveVn.tsx'), 'utf8');
    expect(src).toMatch(/\btap-target\b/);
    expect(src).toMatch(/aria-label=/);
  });

  it('ListRemoveVn carries tap-target + aria-label', () => {
    const src = readFileSync(join(ROOT, 'src/components/ListRemoveVn.tsx'), 'utf8');
    expect(src).toMatch(/\btap-target\b/);
    expect(src).toMatch(/aria-label=/);
  });
});

describe('R5-151 sweep — overlay icon-ONLY buttons carry aria-label', () => {
  it('no `<button class="absolute … z-…">` with an icon-only body lacks aria-label', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      let i = 0;
      while (true) {
        const start = src.indexOf('<button', i);
        if (start < 0) break;
        const end = findJsxOpenTagEnd(src, start);
        if (end < 0) break;
        const tag = src.slice(start, end + 1);
        // Find the closing </button> with a small nesting counter
        // (buttons don't legally nest but be defensive).
        let depth = 1;
        let j = end + 1;
        while (j < src.length && depth > 0) {
          const nextOpen = src.indexOf('<button', j);
          const nextClose = src.indexOf('</button>', j);
          if (nextClose < 0) break;
          if (nextOpen >= 0 && nextOpen < nextClose) {
            depth += 1;
            j = nextOpen + 7;
          } else {
            depth -= 1;
            j = nextClose + 9;
          }
        }
        const closeIdx = j;
        const body = src.slice(end + 1, Math.max(end + 1, closeIdx - 9));
        i = closeIdx;
        // Filter: overlay buttons only — those positioned with
        // `absolute …` + a `z-` value, i.e. the destructive
        // remove-from-list / remove-from-series style chip the
        // row explicitly cited. Other icon buttons (toolbar
        // chips, picker buttons) sit in-flow and are out of
        // scope.
        if (!/\babsolute\b/.test(tag) || !/\bz-\d/.test(tag)) continue;
        // Heuristic "icon-only": the body must NOT reference a
        // `{t.…}` i18n string (text content provides an
        // accessible name) and must NOT contain visible plain
        // text. Strip JSX expression containers + self-closing
        // element tags and check for residual content.
        if (/\{[^}]*\bt\.[a-zA-Z_]/.test(body)) continue;
        const stripped = body
          .replace(/\{[\s\S]*?\}/g, '')
          .replace(/<\w[^/]*\/>/g, '')
          .replace(/\s+/g, '');
        if (stripped.length > 0) continue;
        if (!/\baria-label\s*=/.test(tag)) {
          const before = src.slice(0, start);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
