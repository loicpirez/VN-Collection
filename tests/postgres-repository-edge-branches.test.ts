import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQueryMock, postgresQueryMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  postgresQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: withTransactionMock,
}));

import { createPostgresActivityRepository } from '@/lib/db/repositories/activity';
import { createPostgresDumpRepository } from '@/lib/db/repositories/dump';
import { createPostgresEgsSchemaRepository } from '@/lib/db/repositories/egs-schema';
import { createPostgresEntityNameRepository } from '@/lib/db/repositories/entity-name';
import { createPostgresReadingQueueRepository } from '@/lib/db/repositories/reading-queue';
import {
  createPostgresVnAssetRepository,
  normalizeArtworkRotation,
} from '@/lib/db/repositories/vn-assets';

describe('PostgreSQL repository edge branches', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('bounds activity queries and decodes nullable or malformed payloads', async () => {
    const repository = createPostgresActivityRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, vn_id: 'v90001', kind: 'note', payload: null, occurred_at: 1 },
          { id: 2, vn_id: 'v90001', kind: 'note', payload: '{bad', occurred_at: 2 },
          { id: 3, vn_id: 'v90001', kind: 'note', payload: '[]', occurred_at: 3 },
          { id: 4, vn_id: 'v90001', kind: 'note', payload: '{"length":3}', occurred_at: 4 },
        ],
        rowCount: 4,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 5, vn_id: 'v90002', kind: 'status', payload: '{}', occurred_at: 5, title: null }],
        rowCount: 1,
      });

    await expect(repository.listUser()).resolves.toEqual([]);
    expect(postgresQueryMock.mock.calls[0]?.[1]).toEqual([100]);
    await expect(repository.listForVn('v90001', Number.NaN)).resolves.toEqual([
      expect.objectContaining({ id: 1, payload: null }),
      expect.objectContaining({ id: 2, payload: null }),
      expect.objectContaining({ id: 3, payload: null }),
      expect.objectContaining({ id: 4, payload: { length: 3 } }),
    ]);
    expect(postgresQueryMock.mock.calls[1]?.[1]).toEqual(['v90001', 50]);
    await expect(repository.listRecent()).resolves.toEqual([
      expect.objectContaining({ vn_id: 'v90002', title: 'v90002' }),
    ]);
  });

  it('fails closed on absent dump and EGS summary rows', async () => {
    await expect(createPostgresDumpRepository().summary()).rejects.toThrow('dump summary query returned no row');
    await expect(createPostgresEgsSchemaRepository().summary()).rejects.toThrow('EGS schema summary query returned no row');
  });

  it('sorts dump states and handles empty and capped progress ratios', async () => {
    const repository = createPostgresDumpRepository();
    postgresQueryMock
      .mockResolvedValueOnce({
        rows: [{ total_vns: 0, total_editions: 0, dumped_editions: 0, coll_dumped_no_editions: 0, fully_dumped_vns: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total_vns: 1, total_editions: 1, dumped_editions: 3, coll_dumped_no_editions: 0, fully_dumped_vns: 1 }],
      })
      .mockResolvedValueOnce({ rows: [
        { vn_id: 'v90001', vn_title: 'Done', vn_image_thumb: null, vn_image_url: null, vn_local_image_thumb: null, vn_image_sexual: null, coll_dumped: 1, dumped_ignored: 0, total_editions: 2, dumped_editions: 2 },
        { vn_id: 'v90002', vn_title: 'Partial', vn_image_thumb: null, vn_image_url: null, vn_local_image_thumb: null, vn_image_sexual: null, coll_dumped: 0, dumped_ignored: 0, total_editions: 2, dumped_editions: 1 },
        { vn_id: 'v90003', vn_title: 'Pending', vn_image_thumb: null, vn_image_url: null, vn_local_image_thumb: null, vn_image_sexual: null, coll_dumped: 0, dumped_ignored: 1, total_editions: 0, dumped_editions: 0 },
      ] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001' }, { vn_id: 'v90001' }, { vn_id: 'v90003' }] });

    await expect(repository.summary()).resolves.toMatchObject({ editionPct: 0 });
    await expect(repository.summary()).resolves.toMatchObject({ editionPct: 100 });
    await expect(repository.listStatus()).resolves.toEqual([
      expect.objectContaining({ vn_id: 'v90002', collection_dumped: false }),
      expect.objectContaining({ vn_id: 'v90003', dumped_ignored: true }),
      expect.objectContaining({ vn_id: 'v90001', collection_dumped: true }),
    ]);
    await expect(repository.listShelfVnIds()).resolves.toEqual(new Set(['v90001', 'v90003']));
  });

  it('resolves direct and embedded entity names while skipping redundant fallbacks', async () => {
    const repository = createPostgresEntityNameRepository();
    await expect(repository.vnTitles([])).resolves.toEqual(new Map());
    await expect(repository.producerNames([])).resolves.toEqual(new Map());
    await expect(repository.staffNames([])).resolves.toEqual(new Map());
    await expect(repository.characterNames([])).resolves.toEqual(new Map());

    postgresQueryMock.mockResolvedValueOnce({ rows: [{ id: 'p90001', name: 'Direct' }] });
    await expect(repository.producerNames(['p90001'])).resolves.toEqual(new Map([['p90001', 'Direct']]));

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: 'p90002', developers: '[{"id":"p90002","name":"Embedded"}]' },
        { id: 'p90002', developers: '[{"id":"p90002","name":"Ignored duplicate"}]' },
        { id: 'p90003', developers: '[]' },
      ] });
    await expect(repository.producerNames(['p90002', 'p90003'])).resolves.toEqual(
      new Map([['p90002', 'Embedded']]),
    );

    postgresQueryMock.mockResolvedValueOnce({ rows: [{ id: 's90001', name: 'Writer' }] });
    await expect(repository.staffNames(['s90001'])).resolves.toEqual(new Map([['s90001', 'Writer']]));
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 's90002', name: 'Actor' }] });
    await expect(repository.staffNames(['s90002'])).resolves.toEqual(new Map([['s90002', 'Actor']]));
  });

  it('rejects a reading queue insert without a returned row and skips empty reorders', async () => {
    const repository = createPostgresReadingQueueRepository();
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.add('V90001')).rejects.toThrow('reading queue insert did not return a row');
    await repository.reorder([]);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);

    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.remove('V90001')).resolves.toBe(false);
  });

  it('normalizes and patches artwork while deduplicating publisher indexes', async () => {
    expect(normalizeArtworkRotation(null)).toBe(0);
    expect(normalizeArtworkRotation(-90)).toBe(270);
    expect(normalizeArtworkRotation(90)).toBe(90);
    expect(normalizeArtworkRotation(45)).toBe(0);

    const repository = createPostgresVnAssetRepository();
    await repository.patchArtwork('v90001', {});
    expect(postgresQueryMock).not.toHaveBeenCalled();
    await repository.patchArtwork('v90001', {
      customCover: null,
      coverRotation: 180,
      bannerImage: '/banner.jpg',
      bannerPosition: 'center',
      bannerRotation: 270,
    });
    expect(postgresQueryMock.mock.calls[0]?.[1]).toEqual([null, 180, '/banner.jpg', 'center', 270, 'v90001']);

    await repository.setPublishers('v90001', [
      { id: '', name: 'Missing id' },
      { id: 'p90001', name: '' },
      { id: 'p90001', name: 'Publisher' },
      { id: 'p90001', name: 'Duplicate' },
    ]);
    expect(clientQueryMock.mock.calls[0]?.[1]).toEqual(['[{"id":"p90001","name":"Publisher"}]', 'v90001']);
    expect(clientQueryMock.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO vn_publisher_index'))).toHaveLength(1);
  });
});
