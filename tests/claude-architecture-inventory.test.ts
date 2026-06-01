import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const CLAUDE = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function markedBlock(start: string, end: string): string {
  const from = CLAUDE.indexOf(start);
  const to = CLAUDE.indexOf(end);
  expect(from, `${start} must exist`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} must exist`).toBeGreaterThan(from);
  return CLAUDE.slice(from + start.length, to);
}

describe('CLAUDE architecture inventory', () => {
  it('enumerates every API route file with its exported HTTP methods', () => {
    const documented = new Map<string, string[]>();
    const block = markedBlock('<!-- API_ROUTE_INVENTORY_START -->', '<!-- API_ROUTE_INVENTORY_END -->');
    for (const match of block.matchAll(/^\| (\/api\/[^| ]+) \| ([A-Z, ]+) \|$/gm)) {
      documented.set(match[1], match[2].split(', '));
    }

    const actual = new Map<string, string[]>();
    const apiRoot = join(ROOT, 'src/app/api');
    for (const file of filesUnder(apiRoot).filter((path) => path.endsWith('/route.ts')).sort()) {
      const source = readFileSync(file, 'utf8');
      const methods = Array.from(
        source.matchAll(/^export (?:async )?function (GET|POST|PATCH|DELETE|PUT)\b/gm),
        (match) => match[1],
      );
      const route = `/api/${relative(apiRoot, file).replace(/\/route\.ts$/, '')}`;
      actual.set(route, methods);
    }
    expect(documented).toEqual(actual);
  });

  it('enumerates every bootstrap SQLite table', () => {
    const documented = Array.from(
      markedBlock('<!-- DB_TABLE_INVENTORY_START -->', '<!-- DB_TABLE_INVENTORY_END -->')
        .matchAll(/^\| ([a-z0-9_]+) \|/gm),
      (match) => match[1],
    ).sort();
    const schemaSource = readFileSync(join(ROOT, 'src/lib/db.ts'), 'utf8');
    const actual = Array.from(
      new Set(Array.from(schemaSource.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/g), (match) => match[1])),
    ).sort();
    expect(documented).toEqual(actual);
  });

  it('documents the scoped refresh POST body and private media boundary accurately', () => {
    expect(CLAUDE).toContain('| POST | `/api/refresh/scope` | Scoped cache invalidation. Body: `{ scope: string, params?: Record<string, string> }`.');
    expect(CLAUDE).not.toContain('| GET | `/api/refresh/scope` |');
    expect(CLAUDE).toContain('| GET | `/api/files/[...path]` | Serve private mirrored/uploaded media');
  });
});
