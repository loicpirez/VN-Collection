import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyPostgresJsonValue,
  preparePostgresJsonRow,
  type PostgresMigrationRow,
} from '@/lib/db/postgres-json-policy';

function repositorySources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? repositorySources(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('PostgreSQL JSON migration policy', () => {
  it('classifies empty, valid, and malformed cells', () => {
    expect(classifyPostgresJsonValue(null)).toBe('empty');
    expect(classifyPostgresJsonValue('   ')).toBe('empty');
    expect(classifyPostgresJsonValue('{"ok":true}')).toBe('valid');
    expect(classifyPostgresJsonValue('{bad')).toBe('malformed');
    expect(classifyPostgresJsonValue(12)).toBe('malformed');
  });

  it('preserves valid values and quarantines every malformed SQLite scalar kind', () => {
    const source: PostgresMigrationRow = {
      id: 'v90001',
      aliases: '["Alias"]',
      developers: '{bad',
      editions: 12,
      extlinks: 1.5,
      languages: 14n,
      platforms: Buffer.from([1, 2, 3]),
      publishers: '',
      relations: null,
    };

    const prepared = preparePostgresJsonRow('vn', source, 44);

    expect(prepared.row).not.toBe(source);
    expect(source.developers).toBe('{bad');
    expect(prepared.row).toMatchObject({
      aliases: '["Alias"]',
      developers: null,
      editions: null,
      extlinks: null,
      languages: null,
      platforms: null,
      publishers: '',
      relations: null,
    });
    expect(prepared.quarantine).toEqual([
      { table: 'vn', column: 'developers', sourceRowid: 44, rawKind: 'text', rawValue: '{bad' },
      { table: 'vn', column: 'editions', sourceRowid: 44, rawKind: 'integer', rawValue: '12' },
      { table: 'vn', column: 'extlinks', sourceRowid: 44, rawKind: 'real', rawValue: '1.5' },
      { table: 'vn', column: 'languages', sourceRowid: 44, rawKind: 'integer', rawValue: '14' },
      { table: 'vn', column: 'platforms', sourceRowid: 44, rawKind: 'blob', rawValue: 'AQID' },
    ]);
  });

  it('leaves rows from tables without contractual JSON untouched', () => {
    const source: PostgresMigrationRow = { id: 1, name: 'Shelf' };
    expect(preparePostgresJsonRow('shelf_unit', source, 1)).toEqual({ row: source, quarantine: [] });
  });

  it('keeps PostgreSQL repositories on normalized indexes instead of raw JSON predicates', () => {
    const offenders = repositorySources(join(process.cwd(), 'src/lib/db/repositories')).filter((path) =>
      /jsonb_array_elements|::jsonb|->>|json_each|json_extract|json_valid/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
