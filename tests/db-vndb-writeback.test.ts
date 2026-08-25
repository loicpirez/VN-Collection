import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  throttledFetch: vi.fn(),
}));

vi.mock('@/lib/vndb-throttle', () => ({
  throttledFetch: mocks.throttledFetch,
}));

import { setAppSetting } from '@/lib/db';
import { maybePushStatusToVndb } from '@/lib/vndb-sync';

beforeEach(() => {
  mocks.throttledFetch.mockReset();
  setAppSetting('vndb_writeback', null);
  setAppSetting('vndb_token', null);
});

describe('maybePushStatusToVndb', () => {
  it('skips undefined status, synthetic ids, disabled writeback, and blank tokens', async () => {
    await maybePushStatusToVndb('v90001', undefined);

    setAppSetting('vndb_writeback', '1');
    setAppSetting('vndb_token', 'tok-valid');
    await maybePushStatusToVndb('egs_90001', 'completed');

    setAppSetting('vndb_writeback', null);
    await maybePushStatusToVndb('v90002', 'completed');

    setAppSetting('vndb_writeback', '1');
    setAppSetting('vndb_token', '   ');
    await maybePushStatusToVndb('v90003', 'completed');

    expect(mocks.throttledFetch).not.toHaveBeenCalled();
  });

  it('pushes VNDB ids with a trimmed token and swallows upstream failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAppSetting('vndb_writeback', '1');
    setAppSetting('vndb_token', '  tok-valid  ');
    mocks.throttledFetch.mockResolvedValueOnce(new Response('', { status: 200 }));

    await maybePushStatusToVndb('v90004', 'playing');

    expect(mocks.throttledFetch).toHaveBeenCalledWith(
      'https://api.vndb.org/kana/ulist/v90004',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Token tok-valid' }),
      }),
    );
    expect(consoleSpy).not.toHaveBeenCalled();

    mocks.throttledFetch.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(maybePushStatusToVndb('v90004', 'completed')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[vndb-writeback:v90004] upstream request failed with status 403',
    );

    mocks.throttledFetch.mockRejectedValueOnce(new Error('upstream failed'));
    await expect(maybePushStatusToVndb('v90004', null)).resolves.toBeUndefined();
    expect(mocks.throttledFetch).toHaveBeenLastCalledWith(
      'https://api.vndb.org/kana/ulist/v90004',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(consoleSpy).toHaveBeenLastCalledWith(
      '[vndb-writeback:v90004] upstream request failed before receiving a response',
    );
  });
});
