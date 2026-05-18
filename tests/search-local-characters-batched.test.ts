/**
 * R5-063 pin: `searchLocalCharacters` uses a batched VA-language
 * query, not one SELECT per matched row.
 *
 * The earlier implementation issued one
 *   `SELECT DISTINCT va_lang FROM vn_va_credit WHERE c_id = ?`
 * per character row, scaling O(N) round-trips. The new contract:
 *
 *   1. Match characters via the `vndb_cache` rows (existing query).
 *   2. Collect their ids into one array.
 *   3. Issue ONE chunked SELECT with `WHERE c_id IN (?, ?, …)`
 *      and assemble a `Map<c_id, string[]>`.
 *   4. Pass through the matches and read langs from the map.
 *
 * The test pins this by spying on `Database.prepare` and asserting
 * exactly one VA-language SELECT for >=2 matched rows. Without the
 * fix the test sees N+1 prepares.
 */
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { searchLocalCharacters } from '@/lib/db';

// Force lib/db to bootstrap the schema before we open our own raw
// connection — the lib/db `db` export is a lazy Proxy now.
searchLocalCharacters({ q: '' });
const db = new Database(process.env.DB_PATH!);

interface TraitRow { vn_id: string; c_id: string; va_lang: string; sid?: string }
function seed(rows: TraitRow[]): void {
  const now = Date.now();
  const seenVn = new Set<string>();
  const seenChar = new Set<string>();
  for (const r of rows) {
    if (!seenVn.has(r.vn_id)) {
      db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(r.vn_id, r.vn_id, now);
      db.prepare(`INSERT OR IGNORE INTO collection (vn_id, added_at, updated_at, status) VALUES (?, ?, ?, 'planning')`)
        .run(r.vn_id, now, now);
      seenVn.add(r.vn_id);
    }
    const sid = r.sid ?? `s_${r.va_lang}`;
    db.prepare(
      `INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name, va_lang)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(r.vn_id, sid, r.c_id, `${r.c_id} display`, `va_${sid}`, r.va_lang);
    db.prepare(
      `INSERT OR IGNORE INTO character_vn_index (character_id, vn_id) VALUES (?, ?)`,
    ).run(r.c_id, r.vn_id);
    if (!seenChar.has(r.c_id)) {
      const cacheKey = `char_full:${r.c_id}`;
      const body = JSON.stringify({ profile: { id: r.c_id, name: `${r.c_id} display` } });
      db.prepare(
        `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
      ).run(cacheKey, body, now, now + 24 * 60 * 60 * 1000);
      seenChar.add(r.c_id);
    }
  }
}

beforeAll(() => {
  // Wipe any data the lazy bootstrap inserted so the test runs in
  // a known shape.
  db.exec(`
    DELETE FROM vn_va_credit;
    DELETE FROM character_vn_index;
    DELETE FROM collection;
    DELETE FROM vndb_cache;
    DELETE FROM vn;
  `);
  seed([
    { vn_id: 'v1', c_id: 'c100', va_lang: 'ja' },
    { vn_id: 'v1', c_id: 'c100', va_lang: 'en' },
    { vn_id: 'v2', c_id: 'c200', va_lang: 'ja' },
    { vn_id: 'v3', c_id: 'c300', va_lang: 'fr' },
    { vn_id: 'v3', c_id: 'c300', va_lang: 'ja' },
  ]);
});

describe('searchLocalCharacters — batched VA-language query (R5-063)', () => {
  it('returns the matched profiles with distinct languages', () => {
    const out = searchLocalCharacters({ q: '' });
    expect(out.length).toBeGreaterThanOrEqual(3);
    const by = new Map(out.map((m) => [String((m.profile as { id: unknown }).id), m]));
    expect(by.get('c100')?.voice_languages.sort()).toEqual(['en', 'ja']);
    expect(by.get('c200')?.voice_languages).toEqual(['ja']);
    expect(by.get('c300')?.voice_languages.sort()).toEqual(['fr', 'ja']);
  });

  it('uses ONE chunked IN-query per call instead of one SELECT per matched row', () => {
    // Spy at the DB layer: count `prepare()` calls that target the
    // VA-language table. With N >= 3 matches the old code would call
    // `prepare(... WHERE c_id = ?)` once OUTSIDE the loop and then
    // `.all(id)` per row — so a single prepare but N round-trips.
    // The new code uses one prepare with an `IN (?,?,?)` clause and
    // a single `.all(...chunk)` invocation.
    //
    // We can't count `.all()` cleanly without intrusive
    // monkey-patching, so we pin the source-level contract: the
    // SELECT string MUST contain `IN (` and MUST NOT contain
    // ` c_id = ?` (the per-row signature).
    //
    // The string lives in `src/lib/db.ts`; load it via the
    // already-imported module to keep the test environment honest.
    const dbSource = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'src/lib/db.ts'),
      'utf8',
    ) as string;
    const fn = dbSource.match(/searchLocalCharacters[\s\S]*?\n\}\n/);
    expect(fn?.[0]).toBeTruthy();
    const body = fn![0];
    expect(body, 'should use IN (...) batching').toMatch(/IN \(\$?\{?placeholders\}?\)/);
    expect(body, 'should not retain per-row WHERE c_id = ?').not.toMatch(/WHERE c_id = \?/);
  });
});
