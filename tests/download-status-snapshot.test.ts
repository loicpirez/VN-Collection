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
});
