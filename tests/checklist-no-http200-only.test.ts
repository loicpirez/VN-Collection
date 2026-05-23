/**
 * R5-217 pin: every FIXED_VERIFIED row carries:
 *   - a real commit hash (7+ hex chars) in the commit column.
 *   - non-empty evidence text of meaningful length.
 *
 * The check is intentionally MINIMUM-bar — it doesn't try to
 * parse the evidence cell into a machine-readable schema (that
 * would force a brittle re-write of every legacy row). The
 * heuristic is: if a row was actually verified, the operator
 * had enough to say beyond "(this commit)" or "OK".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHECKLIST = readFileSync(
  join(__dirname, '..', 'docs/round6-master-regression-checklist.md'),
  'utf8',
);

/**
 * Split a markdown table row by `|` while respecting `\|`
 * escapes and backtick-quoted code spans (which may contain
 * literal pipes like `LIKE 'POST /release|%'`).
 */
function splitMarkdownRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') {
      cur += '|';
      i += 2;
      continue;
    }
    if (c === '`') {
      inCode = !inCode;
      cur += c;
      i += 1;
      continue;
    }
    if (c === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.length > 0) cells.push(cur.trim());
  return cells;
}

describe('R6-217 — FIXED_VERIFIED rows have commit + substantive evidence', () => {
  const lines = CHECKLIST.split('\n').filter((line) => /\bFIXED_VERIFIED\b\s*\|\s*$/.test(line));

  it('the suite finds a meaningful number of closed rows', () => {
    // We expect some rows to be fixed verified already as per the instructions
    expect(lines.length).toBeGreaterThan(10);
  });

  it('every FIXED_VERIFIED row has a commit hash OR an "already shipped" marker', () => {
    // Pre-round-5 baseline rows (R5-001..R5-011) cite the
    // shipped state rather than a round-5 commit; both shapes
    // are acceptable evidence of completion.
    const offenders: string[] = [];
    for (const line of lines) {
      const cells = splitMarkdownRow(line);
      const commit = cells[5] ?? '';
      const ok =
        /[0-9a-f]{7,}/.test(commit) ||
        /\((?:Codex pre-session|already shipped|pre-existing|already pinned|R5-\d+\s+covers\s+this)\b[^)]*\)/i.test(commit);
      if (!ok) {
        const id = cells[1] ?? '<?>';
        offenders.push(`${id}: commit='${commit}'`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every FIXED_VERIFIED row has evidence at least 14 chars long', () => {
    // Threshold gated to reject trivial placeholders like "OK",
    // "Done.", "Fixed", "—". 14 chars covers a meaningful
    // sentence stub or a cross-reference like "same as R5-104".
    // The gate is intentionally lenient: this row is about
    // FORWARD policy, not retroactively rejecting every legacy
    // smoke-test entry.
    const offenders: string[] = [];
    for (const line of lines) {
      const cells = splitMarkdownRow(line);
      const evidence = cells[6] ?? '';
      if (evidence.length < 14) {
        const id = cells[1] ?? '<?>';
        offenders.push(`${id}: evidence='${evidence}' (${evidence.length} chars)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
