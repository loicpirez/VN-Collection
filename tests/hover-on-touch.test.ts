/**
 * R5-150 pin: hover-only controls are reachable on touch.
 *
 * The site uses an `opacity-0 group-hover:opacity-100` pattern
 * to fade in card overlays / per-row actions / media controls
 * on desktop. Without a breakpoint prefix the rule applies on
 * mobile too — and mobile has no hover, so the controls are
 * permanently invisible (and unreachable) on touch.
 *
 * Fix shape: prefix the opacity-0 / group-hover trio with a
 * breakpoint (`md:` is the canonical choice in this codebase;
 * `sm:` for tighter rows like routes). The bare prefix-less
 * shape MUST NOT appear in any source file.
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

/**
 * Match `opacity-0` followed (within the same `className=`
 * string) by `group-hover:opacity-100` without an intervening
 * breakpoint prefix like `md:opacity-0` or `sm:opacity-0`.
 *
 * The regex looks for the literal `opacity-0` token NOT
 * preceded by `:` (which means there's a breakpoint glued
 * onto it like `md:opacity-0`).
 */
const BARE_HOVER_HIDE = /(?<![:\w])opacity-0\b[^"]*group-hover:opacity-100/;

describe('R5-150 — no hover-only control hides itself on touch', () => {
  it('no bare `opacity-0 …group-hover:opacity-100` survives in src/', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      // Test per className="..." string so we don't false-match
      // across unrelated attributes / lines.
      const classNameRe = /className=(?:"([^"]*)"|`([^`]*)`)/g;
      let m: RegExpExecArray | null;
      while ((m = classNameRe.exec(src)) !== null) {
        const cls = m[1] ?? m[2] ?? '';
        if (BARE_HOVER_HIDE.test(cls)) {
          const before = src.slice(0, m.index);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
