import { describe, expect, it } from 'vitest';
import { decodeDownloadStatusSnapshot } from '../src/lib/download-status-snapshot';

describe('decodeDownloadStatusSnapshot', () => {
  it('normalizes valid throttle and job rows', () => {
    expect(decodeDownloadStatusSnapshot({
      throttle: { active: 1, queued: 2, retryAfterMs: 500 },
      jobs: [{
        id: 'job-1',
        kind: 'stock-batch',
        vn_id: null,
        label: 'Refreshing stock',
        total: 3,
        done: 1,
        current_item: null,
        errors: [{ item: 'v90001', message: 'Unavailable' }],
        started_at: 10,
        finished_at: null,
      }],
    })).toMatchObject({
      throttle: { active: 1, queued: 2, retryAfterMs: 500 },
      jobs: [{ id: 'job-1', errors: [{ item: 'v90001', message: 'Unavailable' }] }],
    });
  });

  it('omits malformed jobs and malformed sibling errors', () => {
    expect(decodeDownloadStatusSnapshot({
      throttle: { active: 0, queued: 0 },
      jobs: [
        { id: null },
        {
          id: 'job-1',
          kind: 'staff',
          vn_id: 'v90001',
          label: 'Staff',
          total: 1,
          done: 0,
          errors: [{ item: null }, { item: 's90001', message: 'Unavailable' }],
          started_at: 10,
          finished_at: null,
        },
      ],
    })?.jobs).toEqual([expect.objectContaining({
      id: 'job-1',
      errors: [{ item: 's90001', message: 'Unavailable' }],
    })]);
  });

  it('rejects malformed envelopes', () => {
    expect(decodeDownloadStatusSnapshot(null)).toBeNull();
    expect(decodeDownloadStatusSnapshot({ throttle: null, jobs: [] })).toBeNull();
    expect(decodeDownloadStatusSnapshot({ throttle: { active: -1, queued: 0 }, jobs: [] })).toBeNull();
    expect(decodeDownloadStatusSnapshot({ throttle: { active: 0, queued: 0 }, jobs: null })).toBeNull();
  });

  it('normalizes optional throttle, label, item, and interruption metadata', () => {
    expect(decodeDownloadStatusSnapshot({
      throttle: { active: 0, queued: 0, recent429s: 1, circuitOpen: true },
      jobs: [{
        id: 'job-2',
        kind: 'staff',
        vn_id: 'v90001',
        vn_title: 'Title',
        label: 'Staff',
        label_code: 'staff',
        label_params: { total: 2, name: 'Title' },
        total: 2,
        done: 1,
        current_item: 's90001',
        current_item_code: 'staff',
        current_item_params: null,
        current_item_name: 'Staff member',
        errors: [],
        started_at: 10,
        finished_at: 20,
        cancelled: false,
        interrupted: true,
      }],
    })).toMatchObject({
      throttle: { recent429s: 1, circuitOpen: true },
      jobs: [{
        vn_title: 'Title',
        label_code: 'staff',
        label_params: { total: 2, name: 'Title' },
        current_item_code: 'staff',
        current_item_params: null,
        current_item_name: 'Staff member',
        cancelled: false,
        interrupted: true,
      }],
    });
  });

  it('omits jobs with malformed optional parameter maps', () => {
    const base = {
      id: 'job-3',
      kind: 'staff',
      vn_id: null,
      label: 'Staff',
      total: 1,
      done: 0,
      errors: [],
      started_at: 10,
      finished_at: null,
    };
    expect(decodeDownloadStatusSnapshot({
      throttle: { active: 0, queued: 0 },
      jobs: [
        { ...base, label_params: 'bad' },
        { ...base, current_item_params: { value: Number.NaN } },
      ],
    })?.jobs).toEqual([]);
  });
});
