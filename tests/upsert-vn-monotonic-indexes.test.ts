import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, upsertVn } from '@/lib/db';

const VN_ID = 'v90001';

afterEach(() => {
  vi.restoreAllMocks();
  db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_tag_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_language_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_platform_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('upsertVn monotonic materialized indexes', () => {
  it('ignores stale payload indexes and preserves developers on an empty newer payload', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(200);
    upsertVn({
      id: VN_ID,
      title: 'Current title',
      developers: [{ id: 'p90001', name: 'Current developer' }],
      tags: [{ id: 'g90001', name: 'Current tag', rating: 2, spoiler: 0 }],
      languages: ['ja'],
      platforms: ['win'],
    });

    now.mockReturnValue(100);
    upsertVn({
      id: VN_ID,
      title: 'Stale title',
      developers: [{ id: 'p90002', name: 'Stale developer' }],
      tags: [{ id: 'g90002', name: 'Stale tag', rating: 1, spoiler: 0 }],
      languages: ['en'],
      platforms: ['lin'],
    });

    expect(db.prepare('SELECT title FROM vn WHERE id = ?').get(VN_ID)).toEqual({ title: 'Current title' });
    expect(db.prepare('SELECT producer_id FROM vn_developer_index WHERE vn_id = ?').all(VN_ID)).toEqual([{ producer_id: 'p90001' }]);
    expect(db.prepare('SELECT tag_id FROM vn_tag_index WHERE vn_id = ?').all(VN_ID)).toEqual([{ tag_id: 'g90001' }]);
    expect(db.prepare('SELECT lang FROM vn_language_index WHERE vn_id = ?').all(VN_ID)).toEqual([{ lang: 'ja' }]);
    expect(db.prepare('SELECT platform FROM vn_platform_index WHERE vn_id = ?').all(VN_ID)).toEqual([{ platform: 'win' }]);

    now.mockReturnValue(300);
    upsertVn({ id: VN_ID, title: 'New title', developers: [] });
    const row = db.prepare('SELECT title, developers FROM vn WHERE id = ?').get(VN_ID);
    expect(row).toEqual({ title: 'New title', developers: JSON.stringify([{ id: 'p90001', name: 'Current developer' }]) });
    expect(db.prepare('SELECT producer_id FROM vn_developer_index WHERE vn_id = ?').all(VN_ID)).toEqual([{ producer_id: 'p90001' }]);
  });
});
