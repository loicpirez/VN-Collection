import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Status } from '@/lib/types';

type VndbWriteResult = { ok: boolean; status?: number; message?: string };
type PushStatusToVndb = (vnId: string, status: Status | null, token: string) => Promise<VndbWriteResult>;

const mocks = vi.hoisted(() => ({
  pushStatusToVndb: vi.fn<PushStatusToVndb>(),
}));

vi.mock('@/lib/vndb-sync', () => ({
  pushStatusToVndb: mocks.pushStatusToVndb,
}));

import {
  maybePushStatusToVndb,
  setAppSetting,
} from '@/lib/db';

beforeEach(() => {
  mocks.pushStatusToVndb.mockReset();
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

    expect(mocks.pushStatusToVndb).not.toHaveBeenCalled();
  });

  it('pushes VNDB ids with a trimmed token and swallows upstream failures', async () => {
    setAppSetting('vndb_writeback', '1');
    setAppSetting('vndb_token', '  tok-valid  ');
    mocks.pushStatusToVndb.mockResolvedValueOnce({ ok: true, status: 200 });

    await maybePushStatusToVndb('v90004', 'playing');

    expect(mocks.pushStatusToVndb).toHaveBeenCalledWith('v90004', 'playing', 'tok-valid');

    mocks.pushStatusToVndb.mockRejectedValueOnce(new Error('upstream failed'));
    await expect(maybePushStatusToVndb('v90004', null)).resolves.toBeUndefined();
    expect(mocks.pushStatusToVndb).toHaveBeenCalledWith('v90004', null, 'tok-valid');
  });
});
