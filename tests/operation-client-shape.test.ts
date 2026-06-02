import { describe, expect, it } from 'vitest';
import {
  decodeEgsSyncAppliedCount,
  decodeEgsSyncPreview,
  decodeEgsUsernameSetting,
  decodeSelectiveDownloadQueuedCount,
  decodeStaffDownloadCreditCount,
} from '@/lib/operation-client-shape';

describe('operation client response decoders', () => {
  it('decodes the EGS username and synchronization preview', () => {
    expect(decodeEgsUsernameSetting({ egs_username: 'uid' })).toBe('uid');
    expect(decodeEgsSyncPreview({
      ok: true,
      needsConfig: false,
      suggestions: [{
        vn_id: 'V90017',
        vn_title: 'Title',
        egs_id: 1,
        egs_gamename: 'Title',
        local_minutes: 0,
        egs_minutes: 60,
        local_rating: null,
        egs_score: 80,
        egs_finish_date: '2026-06-01',
        egs_start_date: null,
        local_started_date: null,
        local_finished_date: null,
      }],
    })?.suggestions[0]?.vn_id).toBe('v90017');
    expect(decodeEgsSyncPreview({
      ok: true,
      needsConfig: true,
      suggestions: [{
        vn_id: 'v90017',
        vn_title: 'Title',
        egs_id: 1,
        egs_gamename: 'Title',
        local_minutes: 0,
        egs_minutes: null,
        local_rating: 70,
        egs_score: null,
        egs_finish_date: null,
        egs_start_date: '2026-06-01',
        local_started_date: '2026-06-01',
        local_finished_date: '2026-06-02',
      }],
    })?.needsConfig).toBe(true);
    expect(decodeEgsSyncPreview({ ok: true, needsConfig: false, suggestions: [{ vn_id: 'bad' }] })).toBeNull();
    expect(decodeEgsSyncPreview({ ok: true, needsConfig: false, suggestions: Array(1_001).fill(null) })).toBeNull();
  });

  it('decodes bounded operational counters', () => {
    expect(decodeEgsSyncAppliedCount({ applied: 2 })).toBe(2);
    expect(decodeSelectiveDownloadQueuedCount({ queued: 3 })).toBe(3);
    expect(decodeStaffDownloadCreditCount({
      ok: true,
      productionCount: 4,
      vaCount: 5,
      fetched_at: 10,
    })).toBe(9);
    expect(decodeStaffDownloadCreditCount({ ok: true, productionCount: -1, vaCount: 5, fetched_at: 10 })).toBeNull();
    expect(decodeEgsUsernameSetting({ egs_username: null })).toBeNull();
    expect(decodeEgsSyncAppliedCount({ applied: -1 })).toBeNull();
    expect(decodeSelectiveDownloadQueuedCount({ queued: -1 })).toBeNull();
  });
});
