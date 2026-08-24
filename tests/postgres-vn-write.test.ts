import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawVnPayload } from '@/lib/db';

const { clientQueryMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  withPostgresTransaction: withTransactionMock,
}));

import { createPostgresVnWriteRepository } from '@/lib/db/repositories/vn-write';

describe('PostgreSQL VN writer', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('serializes a rich VN and rebuilds every materialized index in batches', async () => {
    const tags = Array.from({ length: 251 }, (_, index) => ({
      id: `g${index + 1}`,
      name: index === 0 ? '' : `Tag ${index + 1}`,
      rating: 2,
      spoiler: 0,
      lie: index === 0,
      category: index === 1 ? null : 'cont' as const,
    }));
    tags.push({ id: '', name: 'Filtered', rating: 0, spoiler: 0, lie: false, category: 'cont' });
    Reflect.set(tags[2], 'name', 4);
    Reflect.set(tags[3], 'spoiler', 'invalid');
    Reflect.set(tags[4], 'category', 4);
    const developers = [
      { id: 'p90001', name: 'Developer' },
      { id: '', name: 'Filtered developer' },
    ];
    const languages = ['en', 'ja', ''];
    const platforms = ['win', 'swi', ''];
    Reflect.set(languages, 1, 4);
    Reflect.set(platforms, 1, 4);
    const payload: RawVnPayload = {
      id: 'v90001',
      title: 'Rich payload',
      alttitle: 'Alternate',
      aliases: ['Alias'],
      titles: [{ lang: 'en', title: 'Rich payload', latin: null, official: true, main: true }],
      released: '2026-01-01',
      olang: 'ja',
      devstatus: 0,
      languages,
      platforms,
      length_minutes: 120,
      length: 2,
      length_votes: 3,
      rating: 80,
      votecount: 10,
      average: 75,
      description: 'Description',
      image: { url: 'https://example.test/image.jpg', thumbnail: 'https://example.test/thumb.jpg', sexual: 1, violence: 2 },
      extlinks: [{ url: 'https://example.test', label: 'site', name: 'Site' }],
      has_anime: true,
      editions: [{ eid: 1, lang: 'ja', name: 'Original', official: true }],
      developers,
      tags,
      screenshots: [],
      relations: [
        {
          id: 'v90002',
          title: 'Related full',
          alttitle: 'Related alt',
          released: '2025-01-01',
          rating: 70,
          votecount: 4,
          length_minutes: 60,
          languages: ['en'],
          platforms: ['win'],
          developers: [{ id: 'p90002', name: 'Related developer' }],
          image: { url: 'https://example.test/related.jpg', thumbnail: 'https://example.test/related-thumb.jpg', sexual: 0 },
          relation: 'seq',
          relation_official: true,
        },
        { id: 'v90003', title: 'Related minimal', relation: 'char', relation_official: false },
      ],
      staff: [
        { id: 's90001', aid: 2, eid: 3, role: 'scenario', note: 'Lead', name: 'Writer', original: 'Writer original', lang: 'ja' },
        { id: 's90002', name: 'Minimal staff' },
        { id: '', name: 'Filtered staff' },
      ],
      va: [
        {
          note: 'Main role',
          character: { id: 'c90001', name: 'Character', original: 'Character original', image: { url: 'https://example.test/character.jpg' } },
          staff: { id: 's90003', aid: 4, name: 'Actor', original: 'Actor original', lang: 'ja' },
        },
        { character: { id: 'c90002', name: 'Minimal character', image: null }, staff: { id: 's90004', name: 'Minimal actor' } },
        { character: null, staff: null },
      ],
    };

    await createPostgresVnWriteRepository().upsert(payload);

    const sql = clientQueryMock.mock.calls.map(([text]) => String(text));
    expect(sql[0]).toContain('INSERT INTO vn');
    expect(sql).toContain('DELETE FROM vn_staff_credit WHERE vn_id = $1');
    expect(sql).toContain('DELETE FROM vn_va_credit WHERE vn_id = $1');
    expect(sql.some((text) => text.includes('INSERT INTO vn_staff_credit'))).toBe(true);
    expect(sql.some((text) => text.includes('INSERT INTO vn_va_credit'))).toBe(true);
    expect(sql.filter((text) => text.includes('INSERT INTO vn_tag_index'))).toHaveLength(2);
    expect(sql.some((text) => text.includes('INSERT INTO vn_developer_index'))).toBe(true);
    expect(sql.some((text) => text.includes('INSERT INTO vn_language_index'))).toBe(true);
    expect(sql.some((text) => text.includes('INSERT INTO vn_platform_index'))).toBe(true);
  });

  it('handles a minimal VN without issuing empty index inserts', async () => {
    await createPostgresVnWriteRepository().upsert({ id: 'v90010', title: 'Minimal payload' });

    const sql = clientQueryMock.mock.calls.map(([text]) => String(text));
    expect(sql.filter((text) => text.startsWith('DELETE FROM'))).toEqual([
      'DELETE FROM vn_staff_credit WHERE vn_id = $1',
      'DELETE FROM vn_va_credit WHERE vn_id = $1',
      'DELETE FROM vn_tag_index WHERE vn_id = $1',
      'DELETE FROM vn_language_index WHERE vn_id = $1',
      'DELETE FROM vn_platform_index WHERE vn_id = $1',
    ]);
    expect(sql.some((text) => text.startsWith('INSERT INTO vn_'))).toBe(false);
  });

  it('does not rebuild indexes when the monotonic upsert rejects an older row', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await createPostgresVnWriteRepository().upsert({ id: 'v90020', title: 'Older', has_anime: false });
    expect(clientQueryMock).toHaveBeenCalledOnce();

    clientQueryMock.mockReset().mockResolvedValueOnce({ rows: [], rowCount: null });
    await createPostgresVnWriteRepository().upsert({ id: 'v90021', title: 'Unknown result' });
    expect(clientQueryMock).toHaveBeenCalledOnce();
  });
});
