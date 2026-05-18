/**
 * R5-159 pin: every `<input type="number">` / `<input type="url">`
 * declares the matching `inputMode` so mobile keyboards open
 * with the right glyph set (decimal / numeric / url) by default.
 * The HTML `type` attribute alone is not sufficient on iOS —
 * Safari opens the standard QWERTY keyboard unless `inputMode`
 * tells it otherwise.
 *
 * The scan is JSX-tag scoped: for each `<input …>` whose opening
 * tag contains `type="number"` / `type="url"` / `type="tel"`, the
 * SAME opening tag must carry `inputMode=…`.
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

describe('R5-159 — every <input type="number"|"url"|"tel"> has inputMode', () => {
  it('sweep across src/ shows no offender', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      let i = 0;
      while (true) {
        const start = src.indexOf('<input', i);
        if (start < 0) break;
        const end = findJsxOpenTagEnd(src, start);
        if (end < 0) break;
        const tag = src.slice(start, end + 1);
        i = end + 1;
        const typeMatch = /type="(number|url|tel)"/.exec(tag);
        if (!typeMatch) continue;
        if (!/\binputMode\s*=/.test(tag)) {
          const before = src.slice(0, start);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line} (type="${typeMatch[1]}")`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
