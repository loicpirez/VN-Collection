import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findSharedVasForVns } from '@/lib/compare-credits';
import { listCollection, upsertVn } from '@/lib/db';

listCollection({});
const db = new Database(process.env.DB_PATH!);
const compareSource = readFileSync(join(__dirname, '..', 'src/app/compare/page.tsx'), 'utf8');

function resetRows(): void {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM vn_va_credit;
    DELETE FROM vn_staff_credit;
    DELETE FROM vn;
  `);
}

beforeEach(resetRows);

afterAll(() => {
  db.close();
});

describe('compare page shared seiyuu matching', () => {
  it('groups a shared seiyuu by VN and character instead of flattening by first characters only', () => {
    upsertVn({
      id: 'v9600',
      title: 'fixture A',
      va: [
        {
          note: null,
          character: { id: 'c9600', name: 'heroine A', original: null },
          staff: { id: 's9600', aid: 1, name: 'voice A', original: '声 A', lang: 'ja' },
        },
      ],
    });
    upsertVn({
      id: 'v9601',
      title: 'fixture B',
      va: [
        {
          note: null,
          character: { id: 'c9601', name: 'heroine B', original: null },
          staff: { id: 's9600', aid: 1, name: 'voice A', original: '声 A', lang: 'ja' },
        },
      ],
    });

    expect(findSharedVasForVns(['v9600', 'v9601'])).toEqual([
      {
        sid: 's9600',
        va_name: 'voice A',
        va_original: '声 A',
        creditsByVn: [
          { vn_id: 'v9600', characters: [{ c_id: 'c9600', c_name: 'heroine A' }] },
          { vn_id: 'v9601', characters: [{ c_id: 'c9601', c_name: 'heroine B' }] },
        ],
        totalCharacters: 2,
      },
    ]);
  });

  it('sorts shared seiyuu first and highlights them in the seiyuu row', () => {
    expect(compareSource).toContain('const sharedVaIds = new Set(sharedVas.map((va) => va.sid))');
    expect(compareSource).toContain('Number(sharedVaIds.has(b.staff.id)) - Number(sharedVaIds.has(a.staff.id))');
    expect(compareSource).toContain("shared ? 'bg-accent/15 font-bold text-accent' : 'text-muted'");
  });
});
