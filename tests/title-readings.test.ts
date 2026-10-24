import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ backend: 'sqlite', query: vi.fn() }));
vi.mock('@/lib/db/postgres-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/postgres-config')>();
  return { ...actual, readDatabaseConfig: () => state.backend === 'sqlite' ? actual.readDatabaseConfig() : { backend: 'postgres' } };
});
vi.mock('@/lib/db/postgres', () => ({ postgresQuery: state.query }));

import { loadTitleReadings } from '@/lib/db/repositories/title-readings';

describe('cached Japanese title readings', () => {
  beforeEach(() => {
    state.backend = 'sqlite';
    state.query.mockReset();
  });

  it('avoids querying an empty identity set', async () => {
    expect(await loadTitleReadings([])).toEqual(new Map());
    expect(state.query).not.toHaveBeenCalled();
  });

  it('reads furigana from PostgreSQL using a bound identity array', async () => {
    state.backend = 'postgres';
    state.query.mockResolvedValue({ rows: [{ vn_id: 'v95001', reading: 'あおぞら' }] });
    expect(await loadTitleReadings(['v95001'])).toEqual(new Map([['v95001', 'あおぞら']]));
    expect(state.query.mock.calls[0][1]).toEqual([['v95001']]);
  });

  it('reads SQLite furigana for unowned titles and omits missing or blank readings', async () => {
    const { db, upsertVn } = await import('@/lib/db');
    for (const id of ['v95001', 'v95002']) upsertVn({ id, title: 'Synthetic title' });
    db.prepare('INSERT INTO egs_game (vn_id, gamename_furigana, fetched_at) VALUES (?, ?, ?)').run('v95001', 'あおぞら', 1);
    db.prepare('INSERT INTO egs_game (vn_id, gamename_furigana, fetched_at) VALUES (?, ?, ?)').run('v95002', ' ', 1);
    expect(await loadTitleReadings(['v95001', 'v95002', 'v95003'])).toEqual(new Map([['v95001', 'あおぞら']]));
  });
});
