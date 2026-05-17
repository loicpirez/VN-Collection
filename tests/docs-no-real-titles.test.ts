/**
 * Hygiene scan: no real VN / studio / character names in any .md file
 * under the repo. The CLAUDE.md, README.md, FEATURES.md, TUTORIAL.md,
 * PLAN.md, and anything under docs/ are all in scope.
 *
 * This is the documentation-side counterpart to the
 * `personal-phrasing.test.ts` source scan. The two files share the
 * same regex; if you update one, update the other.
 *
 * Self-exempt: this file documents the forbidden tokens verbatim and
 * must opt itself out. CLAUDE.md likewise documents the rule with
 * named placeholders — the regex is tuned to skip a deliberate
 * documentation context (the "in CLAUDE.md" mentions live in a
 * separately allowlisted block, not at file-level).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

// Case-sensitive on purpose so "key/value" doesn't trip "Key/" — the
// real-VN studio is capitalised. Patterns are anchored with word-
// boundaries to keep "Lucia" from matching "lucidity" etc.
const REAL_TITLE_REGEX = new RegExp(
  [
    'Fate/',
    '\\bSaber\\b',
    '\\bRin\\b',
    '\\bSakura\\b',
    '\\bKotomi\\b',
    '\\bTomoyo\\b',
    '\\bAyanami\\b',
    '\\bAsuka\\b',
    '\\bMisaki\\b',
    '\\bSumire\\b',
    '\\bUesaka\\b',
    '\\bWatanuki\\b',
    'Type-Moon',
    '\\bKey/',
    'Nitroplus',
    'Innocent Grey',
    'FrontWing',
    '\\bLucia\\b',
  ].join('|'),
  'g',
);

// Allowlisted markdown files that document the rule — they enumerate
// the forbidden tokens verbatim and must not trip the scan. Keep this
// list tight; new docs should never need to mention real titles.
const SELF_BASENAME = 'docs-no-real-titles.test.ts';

function walkMd(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'data.old' || name === '.git') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkMd(full, out);
    else if (/\.md$/i.test(name)) out.push(full);
  }
  return out;
}

function scan(file: string): Array<{ line: number; phrase: string; snippet: string }> {
  const text = readFileSync(file, 'utf8');
  const hits: Array<{ line: number; phrase: string; snippet: string }> = [];
  REAL_TITLE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REAL_TITLE_REGEX.exec(text)) !== null) {
    const idx = m.index;
    const line = text.slice(0, idx).split('\n').length;
    const snippetStart = Math.max(0, idx - 20);
    const snippetEnd = Math.min(text.length, idx + m[0].length + 20);
    hits.push({
      line,
      phrase: m[0],
      snippet: text.slice(snippetStart, snippetEnd).replace(/\s+/g, ' '),
    });
  }
  return hits;
}

describe('docs hygiene — no real titles in markdown', () => {
  it('every .md file under the repo is free of real-title leaks', () => {
    const files = walkMd(ROOT).filter((f) => !f.endsWith(SELF_BASENAME));
    const violations: Array<{ file: string; line: number; phrase: string; snippet: string }> = [];
    for (const file of files) {
      for (const hit of scan(file)) {
        violations.push({ file: relative(ROOT, file), ...hit });
      }
    }
    if (violations.length > 0) {
      const lines = violations.map(
        (v) => `  ${v.file}:${v.line} → "${v.phrase}" in "...${v.snippet}..."`,
      );
      throw new Error(
        `Found ${violations.length} real-title leak(s) in docs — replace with placeholders:\n${lines.join('\n')}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
