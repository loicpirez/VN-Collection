import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('active audit tracker identifiers', () => {
  it('keeps task identifiers unique within every active report', () => {
    const reports = readdirSync('TODO')
      .filter((name) => name.endsWith('-report-tasks.md'))
      .map((name) => join('TODO', name));

    for (const report of reports) {
      const body = readFileSync(report, 'utf8');
      const identifiers = [...body.matchAll(/^\|\s*((?:R\d+|[A-Z]+A)-\d+)\s*\|/gm)].map((match) => match[1]);
      expect(new Set(identifiers).size, report).toBe(identifiers.length);
    }
  });
});
