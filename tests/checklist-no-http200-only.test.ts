import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORT = readFileSync(
  join(__dirname, '..', 'TODO/round14-full-app-audit-report-tasks.md'),
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

const taskRows = REPORT
  .split('\n')
  .filter((line) => /^\| R14-[A-Z]+-\d+ /.test(line))
  .map(splitMarkdownRow);
const closedRows = taskRows.filter((cells) => cells[5] === 'DONE_WITH_DIFF');

describe('active audit report closure evidence', () => {
  it('contains a meaningful set of closed findings', () => {
    expect(closedRows.length).toBeGreaterThan(100);
  });

  it('assigns one unique identifier to every finding', () => {
    const seen = new Set<string>();
    const duplicates = taskRows
      .map((cells) => cells[1])
      .filter((id) => {
        if (seen.has(id)) return true;
        seen.add(id);
        return false;
      });
    expect(duplicates).toEqual([]);
  });

  it('gives every closed finding a substantive problem and resolution statement', () => {
    const offenders = closedRows
      .filter((cells) => (cells[3] ?? '').length < 80)
      .map((cells) => cells[1]);
    expect(offenders).toEqual([]);
  });

  it('identifies the implementation surface for every closed finding', () => {
    const offenders = closedRows
      .filter((cells) => !cells[4] || cells[4] === '—')
      .map((cells) => cells[1]);
    expect(offenders).toEqual([]);
  });
});
