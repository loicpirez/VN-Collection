import { describe, expect, it } from 'vitest';
import { decodeVndbLocalImportResponse } from '@/lib/vndb-local-import-client-shape';

function preview() {
  return {
    ok: true,
    action: 'preview',
    needsAuth: false,
    canApply: true,
    candidates: [
      { kind: 'vn', key: 'vn:v90001', vn_id: 'V90001', title: 'First', local_status: 'playing' },
      {
        kind: 'release', key: 'release:r90001', vn_id: 'V90001', release_id: 'R90001',
        title: 'First', edition_label: null, remote_status: 1,
      },
    ],
    ineligible: [
      {
        kind: 'vn', key: 'vn:egs_90002', vn_id: 'EGS_90002', release_id: null,
        title: 'Second', reason: 'unmapped_vn',
      },
      {
        kind: 'release', key: 'release:synthetic:v90003', vn_id: 'v90003',
        release_id: 'SYNTHETIC:V90003', title: 'Third', reason: 'synthetic_release',
      },
    ],
    summary: { scanned_vns: 3, scanned_releases: 2, already_in_vndb: 1, already_obtained: 0, ineligible: 2 },
  };
}

describe('decodeVndbLocalImportResponse', () => {
  it('normalizes a complete preview payload', () => {
    expect(decodeVndbLocalImportResponse(preview())).toEqual({
      ...preview(),
      candidates: [
        { kind: 'vn', key: 'vn:v90001', vn_id: 'v90001', title: 'First', local_status: 'playing' },
        {
          kind: 'release', key: 'release:r90001', vn_id: 'v90001', release_id: 'r90001',
          title: 'First', edition_label: null, remote_status: 1,
        },
      ],
      ineligible: [
        {
          kind: 'vn', key: 'vn:egs_90002', vn_id: 'egs_90002', release_id: null,
          title: 'Second', reason: 'unmapped_vn',
        },
        {
          kind: 'release', key: 'release:synthetic:v90003', vn_id: 'v90003',
          release_id: 'synthetic:v90003', title: 'Third', reason: 'synthetic_release',
        },
      ],
    });
  });

  it('decodes apply and authentication responses', () => {
    expect(decodeVndbLocalImportResponse({
      ok: true,
      action: 'apply',
      needsAuth: false,
      applied: ['vn:v90001'],
      conflicts: [
        { key: 'vn:v90002', reason: 'local_missing' },
        { key: 'vn:v90003', reason: 'local_changed' },
        { key: 'vn:v90004', reason: 'remote_changed' },
      ],
      failures: [
        { key: 'release:r90001', code: 'vndb_write_failed' },
        { key: 'release:r90002', code: 'vndb_token_required' },
      ],
    })).toMatchObject({ ok: true, action: 'apply', applied: ['vn:v90001'] });
    for (const errorCode of [
      'vndb_token_required',
      'vndb_list_read_permission_required',
      'vndb_list_write_permission_required',
    ]) {
      expect(decodeVndbLocalImportResponse({
        ok: false,
        action: 'preview',
        needsAuth: errorCode === 'vndb_token_required',
        errorCode,
      })).toMatchObject({ ok: false, errorCode });
    }
  });

  it('rejects malformed envelopes and error codes', () => {
    expect(decodeVndbLocalImportResponse(null)).toBeNull();
    expect(decodeVndbLocalImportResponse({})).toBeNull();
    expect(decodeVndbLocalImportResponse({ ok: false, action: 'preview', needsAuth: false, errorCode: 'other' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), action: 'other' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), needsAuth: true })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), canApply: 'yes' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), candidates: 'bad' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), ineligible: 'bad' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), summary: null })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...preview(), summary: { ...preview().summary, scanned_vns: -1 } })).toBeNull();
  });

  it('rejects malformed and duplicate preview rows', () => {
    const base = preview();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [null] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [{ kind: 'vn', key: 'bad', vn_id: 'v90001', title: 'X', local_status: 'planning' }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [{ kind: 'release', key: 'release:r90001', vn_id: 'v90001', release_id: 'bad', title: 'X', edition_label: null, remote_status: null }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [{ kind: 'release', key: 'release:r90001', vn_id: 'v90001', release_id: 'r90001', title: 'X', edition_label: 1, remote_status: null }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [{ kind: 'release', key: 'release:r90001', vn_id: 'v90001', release_id: 'r90001', title: 'X', edition_label: null, remote_status: 9 }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: [base.candidates[0], base.candidates[0]] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, ineligible: [null] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, ineligible: [{ kind: 'vn', key: 1, vn_id: 'egs_1', release_id: null, title: 'X', reason: 'unmapped_vn' }] })).toBeNull();
  });

  it('rejects malformed apply arrays, rows, and duplicates', () => {
    const apply = { ok: true, action: 'apply', needsAuth: false, applied: [], conflicts: [], failures: [] };
    expect(decodeVndbLocalImportResponse({ ...apply, needsAuth: true })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, applied: 'bad' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, applied: ['x', 'x'] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, conflicts: 'bad' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, failures: 'bad' })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, conflicts: [null] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, conflicts: [{ key: 1, reason: 'local_missing' }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, conflicts: [{ key: 'x', reason: 'other' }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, failures: [null] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, failures: [{ key: 1, code: 'vndb_write_failed' }] })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, failures: [{ key: 'x', code: 'other' }] })).toBeNull();
  });

  it('rejects response arrays beyond their bounded sizes', () => {
    const base = preview();
    expect(decodeVndbLocalImportResponse({ ...base, candidates: Array.from({ length: 10_001 }, () => base.candidates[0]) })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...base, ineligible: Array.from({ length: 10_001 }, () => base.ineligible[0]) })).toBeNull();
    const apply = { ok: true, action: 'apply', needsAuth: false, applied: [], conflicts: [], failures: [] };
    expect(decodeVndbLocalImportResponse({ ...apply, applied: Array.from({ length: 101 }, (_, index) => `vn:v${index}`) })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, conflicts: Array.from({ length: 101 }, () => ({ key: 'x', reason: 'local_missing' })) })).toBeNull();
    expect(decodeVndbLocalImportResponse({ ...apply, failures: Array.from({ length: 101 }, () => ({ key: 'x', code: 'vndb_write_failed' })) })).toBeNull();
  });
});
