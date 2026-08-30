import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalVndbImportSnapshot } from '@/lib/db/repositories/vndb-local-import';
import type { VndbUlistEntryDetail } from '@/lib/vndb';

const mocks = vi.hoisted(() => ({
  getAuthInfo: vi.fn(),
  fetchUlistEntriesByIds: vi.fn(),
  patchUlistEntry: vi.fn(),
  patchRlistEntry: vi.fn(),
  listSnapshot: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getAuthInfo: mocks.getAuthInfo,
  fetchUlistEntriesByIds: mocks.fetchUlistEntriesByIds,
  patchUlistEntry: mocks.patchUlistEntry,
  patchRlistEntry: mocks.patchRlistEntry,
}));

vi.mock('@/lib/db/repositories/vndb-local-import', () => ({
  getVndbLocalImportRepository: () => ({ listSnapshot: mocks.listSnapshot }),
}));

import {
  decodeVndbLocalImportSelections,
  importLocalLibraryToVndb,
  type VndbLocalImportSelection,
} from '@/lib/vndb-local-import';

function auth(permissions = ['listread', 'listwrite']) {
  return { id: 'u9001', username: 'tester', permissions };
}

function entry(
  id: string,
  releases: Array<{ id: string; title: string; list_status: 0 | 1 | 2 | 3 | 4 }> = [],
): VndbUlistEntryDetail {
  return {
    id,
    added: 1,
    voted: null,
    lastmod: 2,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: [],
    releases,
  };
}

function snapshot(overrides: Partial<LocalVndbImportSnapshot> = {}): LocalVndbImportSnapshot {
  return { vns: [], releases: [], ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthInfo.mockResolvedValue(auth());
  mocks.listSnapshot.mockResolvedValue(snapshot());
  mocks.fetchUlistEntriesByIds.mockResolvedValue([]);
  mocks.patchUlistEntry.mockResolvedValue({ ok: true });
  mocks.patchRlistEntry.mockResolvedValue({ ok: true });
});

describe('decodeVndbLocalImportSelections', () => {
  it('normalizes valid VN and release snapshots', () => {
    expect(decodeVndbLocalImportSelections([
      { kind: 'vn', vn_id: 'V90001', local_status: 'playing' },
      { kind: 'release', vn_id: 'V90001', release_id: 'R90001', remote_status: null },
      { kind: 'release', vn_id: 'v90002', release_id: 'r90002', remote_status: 3 },
    ])).toEqual([
      { kind: 'vn', vn_id: 'v90001', local_status: 'playing' },
      { kind: 'release', vn_id: 'v90001', release_id: 'r90001', remote_status: null },
      { kind: 'release', vn_id: 'v90002', release_id: 'r90002', remote_status: 3 },
    ]);
  });

  it('rejects malformed, empty, oversized, and duplicate snapshots', () => {
    expect(decodeVndbLocalImportSelections(null)).toBeNull();
    expect(decodeVndbLocalImportSelections([])).toBeNull();
    expect(decodeVndbLocalImportSelections(Array.from({ length: 101 }, (_, index) => ({
      kind: 'vn', vn_id: `v${91000 + index}`, local_status: 'planning',
    })))).toBeNull();
    expect(decodeVndbLocalImportSelections([null])).toBeNull();
    expect(decodeVndbLocalImportSelections([{ kind: 'vn', vn_id: 'bad', local_status: 'planning' }])).toBeNull();
    expect(decodeVndbLocalImportSelections([{ kind: 'vn', vn_id: 'v90001', local_status: 'invalid' }])).toBeNull();
    expect(decodeVndbLocalImportSelections([{ kind: 'release', vn_id: 'v90001', release_id: 'bad', remote_status: null }])).toBeNull();
    expect(decodeVndbLocalImportSelections([{ kind: 'release', vn_id: 'v90001', release_id: 'r90001', remote_status: 5 }])).toBeNull();
    expect(decodeVndbLocalImportSelections([
      { kind: 'vn', vn_id: 'v90001', local_status: 'planning' },
      { kind: 'vn', vn_id: 'V90001', local_status: 'planning' },
    ])).toBeNull();
    expect(decodeVndbLocalImportSelections([
      { kind: 'release', vn_id: 'v90001', release_id: 'r90001', remote_status: null },
      { kind: 'release', vn_id: 'v90002', release_id: 'R90001', remote_status: null },
    ])).toBeNull();
  });
});

describe('local to VNDB preview', () => {
  it('reports missing authentication and list-read permission', async () => {
    mocks.getAuthInfo.mockResolvedValueOnce(null).mockResolvedValueOnce(auth(['listwrite']));
    await expect(importLocalLibraryToVndb({ action: 'preview' })).resolves.toEqual({
      ok: false,
      action: 'preview',
      needsAuth: true,
      errorCode: 'vndb_token_required',
    });
    await expect(importLocalLibraryToVndb({ action: 'preview' })).resolves.toEqual({
      ok: false,
      action: 'preview',
      needsAuth: false,
      errorCode: 'vndb_list_read_permission_required',
    });
    expect(mocks.listSnapshot).not.toHaveBeenCalled();
  });

  it('builds a complete review list without writing or hiding ineligible rows', async () => {
    mocks.getAuthInfo.mockResolvedValue(auth(['listread']));
    mocks.listSnapshot.mockResolvedValue(snapshot({
      vns: [
        { vn_id: 'v90001', title: 'Local one', status: 'playing' },
        { vn_id: 'v90002', title: 'Already remote', status: 'completed' },
        { vn_id: 'egs_90003', title: 'Needs mapping', status: 'planning' },
      ],
      releases: [
        { vn_id: 'v90001', release_id: 'r90011', vn_title: 'Local one', edition_label: 'Box' },
        { vn_id: 'v90002', release_id: 'r90012', vn_title: 'Already remote', edition_label: null },
        { vn_id: 'v90002', release_id: 'synthetic:v90002', vn_title: 'Already remote', edition_label: null },
        { vn_id: 'egs_90003', release_id: 'r90013', vn_title: 'Needs mapping', edition_label: null },
        { vn_id: 'v90004', release_id: 'r90014', vn_title: 'Release only', edition_label: 'Disc' },
        { vn_id: 'v90004', release_id: 'r90014', vn_title: 'Release only duplicate', edition_label: null },
      ],
    }));
    mocks.fetchUlistEntriesByIds.mockResolvedValue([
      entry('v90002', [{ id: 'r90012', title: 'Edition', list_status: 2 }]),
      entry('v90004', [{ id: 'r99999', title: 'Other', list_status: 1 }]),
    ]);

    const result = await importLocalLibraryToVndb({ action: 'preview' });

    expect(result).toEqual({
      ok: true,
      action: 'preview',
      needsAuth: false,
      canApply: false,
      candidates: [
        { kind: 'vn', key: 'vn:v90001', vn_id: 'v90001', title: 'Local one', local_status: 'playing' },
        {
          kind: 'release', key: 'release:r90011', vn_id: 'v90001', release_id: 'r90011',
          title: 'Local one', edition_label: 'Box', remote_status: null,
        },
        {
          kind: 'release', key: 'release:r90014', vn_id: 'v90004', release_id: 'r90014',
          title: 'Release only', edition_label: 'Disc', remote_status: null,
        },
      ],
      ineligible: [
        {
          kind: 'vn', key: 'vn:egs_90003', vn_id: 'egs_90003', release_id: null,
          title: 'Needs mapping', reason: 'unmapped_vn',
        },
        {
          kind: 'release', key: 'release:synthetic:v90002', vn_id: 'v90002',
          release_id: 'synthetic:v90002', title: 'Already remote', reason: 'synthetic_release',
        },
        {
          kind: 'release', key: 'release:r90013', vn_id: 'egs_90003', release_id: 'r90013',
          title: 'Needs mapping', reason: 'unmapped_vn',
        },
      ],
      summary: {
        scanned_vns: 3,
        scanned_releases: 6,
        already_in_vndb: 1,
        already_obtained: 1,
        ineligible: 3,
      },
    });
    expect(mocks.fetchUlistEntriesByIds).toHaveBeenCalledWith(
      'u9001',
      ['v90001', 'v90002', 'v90004'],
      expect.objectContaining({ fresh: true }),
    );
    expect(mocks.patchUlistEntry).not.toHaveBeenCalled();
    expect(mocks.patchRlistEntry).not.toHaveBeenCalled();
  });

  it('skips remote calls for an entirely synthetic snapshot and batches large valid snapshots', async () => {
    mocks.listSnapshot.mockResolvedValueOnce(snapshot({
      vns: [{ vn_id: 'egs_90001', title: 'Synthetic', status: 'planning' }],
    }));
    const synthetic = await importLocalLibraryToVndb({ action: 'preview' });
    expect(synthetic.ok && synthetic.action === 'preview' ? synthetic.ineligible : []).toHaveLength(1);
    expect(mocks.fetchUlistEntriesByIds).not.toHaveBeenCalled();

    mocks.listSnapshot.mockResolvedValueOnce(snapshot({
      vns: Array.from({ length: 101 }, (_, index) => ({
        vn_id: `v${92000 + index}`,
        title: `Title ${index}`,
        status: 'planning' as const,
      })),
    }));
    await importLocalLibraryToVndb({ action: 'preview' });
    expect(mocks.fetchUlistEntriesByIds).toHaveBeenCalledTimes(2);
    expect(mocks.fetchUlistEntriesByIds.mock.calls[0][1]).toHaveLength(100);
    expect(mocks.fetchUlistEntriesByIds.mock.calls[1][1]).toHaveLength(1);
  });

  it('resolves a bundled release state across every linked local VN', async () => {
    mocks.listSnapshot.mockResolvedValue(snapshot({
      vns: [
        { vn_id: 'v92501', title: 'Bundle part one', status: 'planning' },
        { vn_id: 'v92502', title: 'Bundle part two', status: 'planning' },
      ],
      releases: [
        { vn_id: 'v92501', release_id: 'r92501', vn_title: 'Bundle part one', edition_label: null },
        { vn_id: 'v92502', release_id: 'r92501', vn_title: 'Bundle part two', edition_label: null },
      ],
    }));
    mocks.fetchUlistEntriesByIds.mockResolvedValue([
      entry('v92501'),
      entry('v92502', [{ id: 'r92501', title: 'Bundle', list_status: 2 }]),
    ]);
    const result = await importLocalLibraryToVndb({ action: 'preview' });
    expect(result.ok && result.action === 'preview' ? result.summary.already_obtained : 0).toBe(1);
    expect(result.ok && result.action === 'preview'
      ? result.candidates.some((row) => row.kind === 'release' && row.release_id === 'r92501')
      : true).toBe(false);
  });
});

describe('local to VNDB apply', () => {
  it('reports missing authentication, read permission, and write permission', async () => {
    const selections: VndbLocalImportSelection[] = [{ kind: 'vn', vn_id: 'v90001', local_status: 'planning' }];
    mocks.getAuthInfo
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(auth(['listwrite']))
      .mockResolvedValueOnce(auth(['listread']));
    expect(await importLocalLibraryToVndb({ action: 'apply', selections })).toMatchObject({
      ok: false, errorCode: 'vndb_token_required',
    });
    expect(await importLocalLibraryToVndb({ action: 'apply', selections })).toMatchObject({
      ok: false, errorCode: 'vndb_list_read_permission_required',
    });
    expect(await importLocalLibraryToVndb({ action: 'apply', selections })).toMatchObject({
      ok: false, errorCode: 'vndb_list_write_permission_required',
    });
    expect(mocks.listSnapshot).not.toHaveBeenCalled();
  });

  it('revalidates VN selections and applies only unchanged missing entries', async () => {
    const selections: VndbLocalImportSelection[] = [
      { kind: 'vn', vn_id: 'v90001', local_status: 'playing' },
      { kind: 'vn', vn_id: 'v90002', local_status: 'playing' },
      { kind: 'vn', vn_id: 'v90003', local_status: 'planning' },
      { kind: 'vn', vn_id: 'v90004', local_status: 'completed' },
      { kind: 'vn', vn_id: 'v90005', local_status: 'on_hold' },
      { kind: 'vn', vn_id: 'v90006', local_status: 'dropped' },
    ];
    mocks.listSnapshot.mockResolvedValue(snapshot({
      vns: [
        { vn_id: 'v90002', title: 'Changed', status: 'completed' },
        { vn_id: 'v90003', title: 'Remote', status: 'planning' },
        { vn_id: 'v90004', title: 'Success', status: 'completed' },
        { vn_id: 'v90005', title: 'Token race', status: 'on_hold' },
        { vn_id: 'v90006', title: 'Failure', status: 'dropped' },
      ],
    }));
    mocks.fetchUlistEntriesByIds.mockResolvedValue([entry('v90003')]);
    mocks.patchUlistEntry
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ needsAuth: true })
      .mockRejectedValueOnce(new Error('upstream private detail'));

    const result = await importLocalLibraryToVndb({ action: 'apply', selections });

    expect(result).toEqual({
      ok: true,
      action: 'apply',
      needsAuth: false,
      applied: ['vn:v90004'],
      conflicts: [
        { key: 'vn:v90001', reason: 'local_missing' },
        { key: 'vn:v90002', reason: 'local_changed' },
        { key: 'vn:v90003', reason: 'remote_changed' },
      ],
      failures: [
        { key: 'vn:v90005', code: 'vndb_token_required' },
        { key: 'vn:v90006', code: 'vndb_write_failed' },
      ],
    });
    expect(mocks.patchUlistEntry).toHaveBeenNthCalledWith(1, 'v90004', {
      labels_set: [2],
      labels_unset: [5, 1, 3, 4],
    });
  });

  it('revalidates release selections and imports obtained status with granular failures', async () => {
    const selections: VndbLocalImportSelection[] = [
      { kind: 'release', vn_id: 'v90001', release_id: 'r90001', remote_status: null },
      { kind: 'release', vn_id: 'v90002', release_id: 'r90002', remote_status: 1 },
      { kind: 'release', vn_id: 'v90003', release_id: 'r90003', remote_status: null },
      { kind: 'release', vn_id: 'v90004', release_id: 'r90004', remote_status: null },
      { kind: 'release', vn_id: 'v90005', release_id: 'r90005', remote_status: null },
    ];
    mocks.listSnapshot.mockResolvedValue(snapshot({
      releases: [
        { vn_id: 'v90002', release_id: 'r90002', vn_title: 'Remote changed', edition_label: null },
        { vn_id: 'v90003', release_id: 'r90003', vn_title: 'Success', edition_label: null },
        { vn_id: 'v90004', release_id: 'r90004', vn_title: 'Token race', edition_label: null },
        { vn_id: 'v90005', release_id: 'r90005', vn_title: 'Failure', edition_label: null },
        { vn_id: 'v90006', release_id: 'r99999', vn_title: 'Unselected', edition_label: null },
      ],
    }));
    mocks.fetchUlistEntriesByIds.mockResolvedValue([
      entry('v90002', [{ id: 'r90002', title: 'Edition', list_status: 3 }]),
    ]);
    mocks.patchRlistEntry
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ needsAuth: true })
      .mockRejectedValueOnce(new Error('upstream private detail'));

    const result = await importLocalLibraryToVndb({ action: 'apply', selections });

    expect(result).toEqual({
      ok: true,
      action: 'apply',
      needsAuth: false,
      applied: ['release:r90003'],
      conflicts: [
        { key: 'release:r90001', reason: 'local_missing' },
        { key: 'release:r90002', reason: 'remote_changed' },
      ],
      failures: [
        { key: 'release:r90004', code: 'vndb_token_required' },
        { key: 'release:r90005', code: 'vndb_write_failed' },
      ],
    });
    expect(mocks.patchRlistEntry).toHaveBeenNthCalledWith(1, 'r90003', 2);
  });

  it('applies VN rows before releases regardless of selection order', async () => {
    const selections: VndbLocalImportSelection[] = [
      { kind: 'release', vn_id: 'v90001', release_id: 'r90001', remote_status: null },
      { kind: 'vn', vn_id: 'v90001', local_status: 'planning' },
    ];
    mocks.listSnapshot.mockResolvedValue(snapshot({
      vns: [{ vn_id: 'v90001', title: 'Title', status: 'planning' }],
      releases: [{ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Title', edition_label: null }],
    }));
    const order: string[] = [];
    mocks.patchUlistEntry.mockImplementation(async () => { order.push('vn'); return { ok: true }; });
    mocks.patchRlistEntry.mockImplementation(async () => { order.push('release'); return { ok: true }; });

    const result = await importLocalLibraryToVndb({ action: 'apply', selections });

    expect(order).toEqual(['vn', 'release']);
    expect(result.ok && result.action === 'apply' ? result.applied : []).toEqual(['vn:v90001', 'release:r90001']);
  });

  it('revalidates a selected bundled release through all local VN links', async () => {
    mocks.listSnapshot.mockResolvedValue(snapshot({
      releases: [
        { vn_id: 'v92601', release_id: 'r92601', vn_title: 'Part one', edition_label: null },
        { vn_id: 'v92602', release_id: 'r92601', vn_title: 'Part two', edition_label: null },
      ],
    }));
    mocks.fetchUlistEntriesByIds.mockResolvedValue([
      entry('v92602', [{ id: 'r92601', title: 'Bundle', list_status: 3 }]),
    ]);
    const result = await importLocalLibraryToVndb({
      action: 'apply',
      selections: [{ kind: 'release', vn_id: 'v92601', release_id: 'r92601', remote_status: 1 }],
    });
    expect(mocks.fetchUlistEntriesByIds).toHaveBeenCalledWith(
      'u9001',
      ['v92601', 'v92602'],
      expect.objectContaining({ fresh: true }),
    );
    expect(result.ok && result.action === 'apply' ? result.conflicts : []).toEqual([
      { key: 'release:r92601', reason: 'remote_changed' },
    ]);
    expect(mocks.patchRlistEntry).not.toHaveBeenCalled();
  });
});
