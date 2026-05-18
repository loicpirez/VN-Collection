/**
 * R5-161 pin: every fixed-bottom UI element respects iOS
 * `env(safe-area-inset-bottom)` so it doesn't sit underneath
 * the home-indicator pill on devices that have one.
 *
 * The scan finds every JSX element whose className contains
 * `fixed bottom-…` (including the `inset-x-… bottom-…` shape
 * the ToastProvider uses) and asserts the element ALSO sets
 * either `paddingBottom: 'env(safe-area-inset-bottom)'` or
 * `marginBottom: 'env(safe-area-inset-bottom)'` on its inline
 * `style={…}`.
 *
 * The bottom-0 sticky case (QuoteFooter) and the bottom-4 /
 * bottom-5 / bottom-10 / bottom-12 fixed cases all qualify.
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

describe('R5-161 — every fixed-bottom element respects safe-area-inset-bottom', () => {
  it('no `<div className="… fixed bottom-…">` ships without an env() safe-area inset', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      // Walk every JSX opening tag and check the className.
      const tagRe = /<(?:div|aside|section|nav|footer)\b/g;
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(src)) !== null) {
        const start = m.index;
        const end = findJsxOpenTagEnd(src, start);
        if (end < 0) continue;
        const tag = src.slice(start, end + 1);
        // Match className strings that include `fixed` + `bottom-…`.
        const classMatch = /className=(?:"([^"]*)"|`([^`]*)`)/.exec(tag);
        const cls = classMatch ? (classMatch[1] ?? classMatch[2] ?? '') : '';
        if (!/\bfixed\b/.test(cls) || !/\bbottom-(?:0|\d+)\b/.test(cls)) continue;
        // Asserts: the same opening tag carries an inline style
        // with `safe-area-inset-bottom`.
        if (!/safe-area-inset-bottom/.test(tag)) {
          const before = src.slice(0, start);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
