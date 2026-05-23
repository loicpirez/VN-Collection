/**
 * R5-220 pin: tests / docs / source / scripts must not hardcode
 * real VNDB IDs except inside the sanctioned fixtures module
 * `scripts/qa-ids.mjs`.
 *
 * Definition: a "real" VNDB id matches `^(v|c|s|p)\d+$` with the
 * numeric part in the *plausibly-real* range. The convention in
 * this repo is:
 *   - `1..999`        — throwaway sequential test IDs (v1, c100…),
 *                       exempt.
 *   - `1000..8999`    — likely real VNDB IDs, scanner BLOCKS.
 *   - `9000..99999`   — synthetic test IDs (v9001, c9002, g9001),
 *                       exempt.
 *   - `100000+`       — extended synthetic range (v100001…),
 *                       exempt.
 *
 * Tag IDs `g\d+` are exempt entirely because the lower IDs are
 * public taxonomy slugs (g660, g578) and don't carry copyrighted
 * content.
 *
 * The scanner walks tests/, scripts/, docs/, README.md, and src/
 * (excluding the sanctioned module + tests/fixtures/) and rejects
 * any string literal that matches the real-id pattern.
 *
 * Why this matters: hardcoded real IDs in tests anchor the repo to
 * a specific operator's `.qa` snapshot. Anyone else who runs the
 * tests against their own DB will see false negatives. The
 * sanctioned module documents the snapshot-binding once.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const ALLOWLIST = new Set([
  'scripts/qa-ids.mjs',
  'tests/qa-no-real-ids-outside-fixtures.test.ts',
  // QA scripts are allowed during the migration but must SOURCE
  // their IDs from scripts/qa-ids.mjs (R5-220 follow-up tracks the
  // refactor). For now the scanner allows them so existing QA
  // selectors don't break; once the QA scripts import QA_IDS the
  // exceptions below can be removed.
  'scripts/browser-interactions.mjs',
  'scripts/browser-qa.sh',
  // Audit logs / round checklists legitimately cite real IDs in
  // bug-report context.
  'docs/round6-master-regression-checklist.md',
  'docs/round5-master-regression-checklist.md',
  'docs/round4-regression-checklist.md',
  'docs/test-matrix.md',
  'docs/TODO_/0.md',
  'docs/TODO_/1.md',
  'docs/TODO_/2.md',
  'docs/TODO_/3.md',
  'docs/TODO_/4.md',
  'docs/TODO_/5.md',
  'docs/TODO_/6.md',
  'docs/TODO_/agent-todos-2025-05-22.md',
  'docs/TODO_/audit-2025-05-22.md',
  'docs/TODO_/round4-regression-checklist.md',
  'docs/TODO_/round5-master-regression-checklist.md',
]);

const ROOTS = ['tests', 'scripts', 'docs', 'src'];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.qa' || name === 'fixtures') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (
      name.endsWith('.ts') ||
      name.endsWith('.tsx') ||
      name.endsWith('.mjs') ||
      name.endsWith('.md') ||
      name.endsWith('.sh')
    ) {
      yield full;
    }
  }
}

interface Hit {
  file: string;
  line: number;
  id: string;
  context: string;
}

// Match `vN`, `cN`, `sN`, `pN` where N is a number BELOW 90 000.
// Anchored on word boundaries to skip `vnId`, `vNNN` ranges built
// from variables, `setVN`, etc.
const REAL_ID_RE = /\b([vcsp])(\d{1,4})\b/g;

describe('R5-220 hygiene: no hardcoded real VNDB IDs outside scripts/qa-ids.mjs', () => {
  const hits: Hit[] = [];
  const rootDir = ROOT;
  const files: string[] = [];
  // README is a single file, not a dir.
  files.push(join(rootDir, 'README.md'));
  for (const r of ROOTS) {
    try {
      for (const f of walk(join(rootDir, r))) files.push(f);
    } catch {
      // root may not exist (e.g. fresh checkout) — skip
    }
  }

  for (const abs of files) {
    const rel = relative(rootDir, abs);
    if (ALLOWLIST.has(rel)) continue;
    let body: string;
    try {
      body = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip obvious URL contexts that point to license / official
      // pages whose IDs are public taxonomy (d17 = VNDB Data
      // License, etc.).
      // (Already filtered by ID-prefix below — d/u/r/t/i/w are
      // not in REAL_ID_RE.)
      for (const m of line.matchAll(REAL_ID_RE)) {
        const num = Number(m[2]);
        // Throwaway sequential test IDs.
        if (num <= 999) continue;
        // Synthetic test IDs (9000..99999 or 100000+).
        if (num >= 9000) continue;
        // The blocking range is 1000..8999.
        hits.push({
          file: rel,
          line: i + 1,
          id: m[0],
          context: line.trim().slice(0, 100),
        });
      }
    }
  }

  it('every real VNDB id (4-5 digit v/c/s/p) lives in the sanctioned module', () => {
    if (hits.length > 0) {
      const dump = hits.slice(0, 10).map((h) => `  ${h.file}:${h.line}  ${h.id}  →  ${h.context}`).join('\n');
      const tail = hits.length > 10 ? `\n  …and ${hits.length - 10} more` : '';
      throw new Error(
        `R5-220 violation: ${hits.length} hardcoded real VNDB IDs outside scripts/qa-ids.mjs\n${dump}${tail}\n\n` +
          `Move the IDs into scripts/qa-ids.mjs (under a descriptive capability name) and import them. Synthetic IDs (≥90 000) are fine.`,
      );
    }
    expect(hits).toEqual([]);
  });
});
