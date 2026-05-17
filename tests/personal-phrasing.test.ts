/**
 * Lint guard: no personal / user-referential phrasing in src or tests.
 *
 * The project explicitly forbids phrasings like "the user reported",
 * "user wanted", "my collection", "user's library", etc. — they're
 * holdovers from the original single-operator history when the
 * codebase still referred to the maintainer by name. We've scrubbed
 * the tree once; this test makes sure the scrub doesn't regress
 * silently when new comments / docs land.
 *
 * Scope: every `.ts` / `.tsx` file under `src/` and `tests/`,
 * EXCLUDING the legacy `data.old/` mirror (read-only, never
 * touched), this file itself (it documents the forbidden phrases
 * verbatim), and CLAUDE.md (where the rule is documented).
 *
 * Pattern list mirrors the grep used in the blocker brief.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const FORBIDDEN = [
  'user reported',
  'user wanted',
  'user requested',
  "user's collection",
  "user's library",
  'my collection',
  'my library',
  'user complained',
  // Two spellings of the maintainer's name. The legacy code mentioned
  // both; the case-insensitive scan below catches either.
  'loïc',
  'loic',
] as const;

/**
 * Real-title / studio / character regex. Word-boundary matched (where
 * applicable) to avoid false positives on substrings — e.g. "key/value"
 * must not match "Key/", "lucidity" must not match "Lucia". The patterns
 * mirror the list documented in CLAUDE.md's hygiene section.
 *
 * One single regex (with alternation) so the scanner only walks each
 * file once. Case-SENSITIVE on purpose so generic English words don't
 * collide with capitalised studio / character names.
 */
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

function scanRealTitles(file: string): Array<{ line: number; phrase: string; snippet: string }> {
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

// These test files document the forbidden phrases / real titles
// verbatim, so they must opt themselves out. CLAUDE.md likewise
// enumerates the rule and names the placeholders.
const SELF_BASENAMES = new Set(['personal-phrasing.test.ts', 'docs-no-real-titles.test.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'data.old') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function scanFile(file: string): Array<{ line: number; phrase: string; snippet: string }> {
  const text = readFileSync(file, 'utf8');
  const lower = text.toLowerCase();
  const hits: Array<{ line: number; phrase: string; snippet: string }> = [];
  for (const phrase of FORBIDDEN) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(phrase, from);
      if (idx === -1) break;
      // Compute 1-indexed line number for the report message.
      const line = text.slice(0, idx).split('\n').length;
      const snippetStart = Math.max(0, idx - 20);
      const snippetEnd = Math.min(text.length, idx + phrase.length + 20);
      hits.push({ line, phrase, snippet: text.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ') });
      from = idx + phrase.length;
    }
  }
  return hits;
}

describe('personal phrasing scrub', () => {
  it('no forbidden phrase appears in src/ or tests/', () => {
    const srcRoot = join(ROOT, 'src');
    const testsRoot = join(ROOT, 'tests');
    const files = [...walk(srcRoot), ...walk(testsRoot)].filter(
      (f) => ![...SELF_BASENAMES].some((b) => f.endsWith(b)),
    );
    const violations: Array<{ file: string; line: number; phrase: string; snippet: string }> = [];
    for (const file of files) {
      for (const hit of scanFile(file)) {
        violations.push({ file: relative(ROOT, file), ...hit });
      }
    }
    if (violations.length > 0) {
      const lines = violations.map(
        (v) => `  ${v.file}:${v.line} → "${v.phrase}" in "...${v.snippet}..."`,
      );
      throw new Error(
        `Found ${violations.length} personal-phrasing violation(s):\n${lines.join('\n')}`,
      );
    }
    expect(violations).toEqual([]);
  });
});

describe('real-title scrub (src/ + tests/)', () => {
  it('no recognizable real VN / studio / character name leaks into the codebase', () => {
    const srcRoot = join(ROOT, 'src');
    const testsRoot = join(ROOT, 'tests');
    const files = [...walk(srcRoot), ...walk(testsRoot)].filter(
      // The test files document the forbidden tokens verbatim — exclude.
      (f) => ![...SELF_BASENAMES].some((b) => f.endsWith(b)),
    );
    const violations: Array<{ file: string; line: number; phrase: string; snippet: string }> = [];
    for (const file of files) {
      for (const hit of scanRealTitles(file)) {
        violations.push({ file: relative(ROOT, file), ...hit });
      }
    }
    if (violations.length > 0) {
      const lines = violations.map(
        (v) => `  ${v.file}:${v.line} → "${v.phrase}" in "...${v.snippet}..."`,
      );
      throw new Error(
        `Found ${violations.length} real-title leak(s) — replace with placeholders ("Title Y", "Studio X", "Heroine A"):\n${lines.join('\n')}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
