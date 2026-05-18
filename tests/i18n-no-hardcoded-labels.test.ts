/**
 * R5-162 pin: aria-label / title / placeholder attributes use
 * i18n references (`{t.foo}`) rather than hardcoded English
 * string literals. Hardcoded English breaks the
 * fr/en/ja-symmetric contract enforced by `dictionaries-parity`
 * and forces every locale to ship the same English text.
 *
 * The scan whitelists:
 *   - One-word labels of `<= 2 chars` (e.g. "OK", "EN", "FR")
 *     — those are usually language codes / acronyms.
 *   - URL-shaped placeholders ("https://…", "http://…").
 *   - Empty strings.
 *   - Strings that resemble code (only ASCII punctuation + digits).
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

const HARDCODED_RE = /(aria-label|title|placeholder)="([^"]+)"/g;

function looksLikeHardcodedEnglish(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length <= 2) return false; // language codes / acronyms
  if (/^https?:\/\//.test(v)) return false; // URL placeholders
  if (/^[\d\s\W]+$/.test(v)) return false; // punctuation / numbers
  // Two or more whitespace-separated English-looking words.
  return /^[A-Z][a-z]+(?:\s+[a-zA-Z]+){1,}/.test(v);
}

describe('R5-162 — no hardcoded English aria-label / title / placeholder strings', () => {
  it('no offending attribute survives in src/components or src/app', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      let m: RegExpExecArray | null;
      const localRe = new RegExp(HARDCODED_RE.source, 'g');
      while ((m = localRe.exec(src)) !== null) {
        if (looksLikeHardcodedEnglish(m[2])) {
          const before = src.slice(0, m.index);
          const line = before.split('\n').length;
          offenders.push(`${path.slice(ROOT.length + 1)}:${line} (${m[1]}="${m[2]}")`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('R5-163 — raw enum values render via a label helper, never inline', () => {
  /** Words that look like enum keys (lowercase snake_case). */
  const ENUM_VALUES = ['on_hold', 'completed', 'dropped', 'planning', 'playing'];

  it('no `>{ on_hold }<` / `>{ completed }<` style raw render', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      for (const v of ENUM_VALUES) {
        // Reject the bare JSX text node shape `>v<` and the
        // bare expression-wrapped shape `>{v}<` / `>{'v'}<`.
        const bare = new RegExp(`>\\s*${v}\\s*<`, 'g');
        const wrapped = new RegExp(`>\\s*\\{\\s*['"\`]?${v}['"\`]?\\s*\\}\\s*<`, 'g');
        if (bare.test(src) || wrapped.test(src)) {
          offenders.push(`${path.slice(ROOT.length + 1)} (${v})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
