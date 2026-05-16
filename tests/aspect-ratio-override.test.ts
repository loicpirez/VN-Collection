import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  deriveVnAspectKey,
  getVnAspectOverride,
  listShelves,
  setVnAspectOverride,
  upsertReleaseResolutionCache,
} from '@/lib/db';

// Force schema bootstrap, then open a raw connection for fixture setup
// (same pattern as tests/shelf-layout.test.ts).
listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string, screenshots?: Array<{ dims?: [number, number] }>): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, screenshots, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, id, screenshots ? JSON.stringify(screenshots) : null, now);
}

function clear(): void {
  db.exec(
    `DELETE FROM vn_aspect_override;
     DELETE FROM owned_release_aspect_override;
     DELETE FROM owned_release;
     DELETE FROM release_resolution_cache;
     DELETE FROM shelf_display_slot;
     DELETE FROM shelf_slot;
     DELETE FROM shelf_unit;
     DELETE FROM vn;`,
  );
}

beforeAll(() => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vn_aspect_override', 'release_resolution_cache', 'owned_release_aspect_override')",
    )
    .all() as Array<{ name: string }>;
  expect(tables.map((r) => r.name).sort()).toEqual([
    'owned_release_aspect_override',
    'release_resolution_cache',
    'vn_aspect_override',
  ]);
});

beforeEach(() => {
  clear();
});

describe('VN aspect override + derivation', () => {
  it('falls back to unknown when nothing is known about the VN', () => {
    seedVn('v100');
    expect(deriveVnAspectKey('v100')).toBe('unknown');
    expect(getVnAspectOverride('v100')).toBeNull();
  });

  it('uses screenshot dims as the lowest-priority signal', () => {
    seedVn('v100', [
      { dims: [1920, 1080] },
      { dims: [1920, 1080] },
      { dims: [800, 600] },
    ]);
    // 2 votes for 16:9, 1 vote for 4:3 — 16:9 wins.
    expect(deriveVnAspectKey('v100')).toBe('16:9');
  });

  it('release_resolution_cache (vn-bound) beats screenshot derivation', () => {
    seedVn('v100', [{ dims: [800, 600] }]);
    upsertReleaseResolutionCache({ releaseId: 'r1', vnId: 'v100', resolution: '1920x1080' });
    expect(deriveVnAspectKey('v100')).toBe('16:9');
  });

  it('manual VN-level override beats everything', () => {
    seedVn('v100', [{ dims: [1920, 1080] }]);
    upsertReleaseResolutionCache({ releaseId: 'r1', vnId: 'v100', resolution: '1920x1080' });
    setVnAspectOverride({ vnId: 'v100', aspectKey: '4:3' });
    expect(deriveVnAspectKey('v100')).toBe('4:3');
  });

  it('clearing the manual override falls back to the next signal', () => {
    seedVn('v100', [{ dims: [1920, 1080] }]);
    setVnAspectOverride({ vnId: 'v100', aspectKey: '4:3' });
    expect(deriveVnAspectKey('v100')).toBe('4:3');
    setVnAspectOverride({ vnId: 'v100', aspectKey: null });
    expect(getVnAspectOverride('v100')).toBeNull();
    // Screenshot fallback kicks back in.
    expect(deriveVnAspectKey('v100')).toBe('16:9');
  });

  it('refuses to persist an "unknown" override (clears instead)', () => {
    seedVn('v100');
    setVnAspectOverride({ vnId: 'v100', aspectKey: '16:9' });
    expect(getVnAspectOverride('v100')?.aspect_key).toBe('16:9');
    // Passing "unknown" is treated as a clear, not a stored bucket —
    // there is no UX path where a user would intentionally pin a VN
    // to "unknown".
    setVnAspectOverride({ vnId: 'v100', aspectKey: 'unknown' });
    expect(getVnAspectOverride('v100')).toBeNull();
  });

  it('survives malformed screenshots JSON without crashing', () => {
    seedVn('v100');
    db.prepare('UPDATE vn SET screenshots = ? WHERE id = ?').run('not-json{', 'v100');
    expect(deriveVnAspectKey('v100')).toBe('unknown');
  });
});
