import { describe, expect, it } from 'vitest';
import { acquireAppJobLock, releaseAppJobLock, renewAppJobLock } from '@/lib/db';

describe('durable application job locks', () => {
  it('prevents concurrent owners, renews the owner, and releases conditionally', () => {
    expect(acquireAppJobLock('fixture-lock', 'owner-a', 1_000, 500)).toBe(true);
    expect(acquireAppJobLock('fixture-lock', 'owner-b', 1_100, 500)).toBe(false);
    expect(renewAppJobLock('fixture-lock', 'owner-b', 1_100, 500)).toBe(false);
    expect(renewAppJobLock('fixture-lock', 'owner-a', 1_100, 500)).toBe(true);
    expect(releaseAppJobLock('fixture-lock', 'owner-b')).toBe(false);
    expect(releaseAppJobLock('fixture-lock', 'owner-a')).toBe(true);
  });

  it('lets a new owner replace an expired lock and rejects invalid arguments', () => {
    expect(acquireAppJobLock('expired-lock', 'owner-a', 2_000, 100)).toBe(true);
    expect(acquireAppJobLock('expired-lock', 'owner-b', 2_100, 100)).toBe(true);
    expect(releaseAppJobLock('expired-lock', 'owner-a')).toBe(false);
    expect(releaseAppJobLock('expired-lock', 'owner-b')).toBe(true);
    expect(acquireAppJobLock('', 'owner', 1, 1)).toBe(false);
    expect(acquireAppJobLock('lock', '', 1, 1)).toBe(false);
    expect(acquireAppJobLock('lock', 'owner', Number.NaN, 1)).toBe(false);
    expect(acquireAppJobLock('lock', 'owner', 1, 0)).toBe(false);
    expect(renewAppJobLock('', 'owner', 1, 1)).toBe(false);
    expect(renewAppJobLock('lock', '', 1, 1)).toBe(false);
    expect(renewAppJobLock('lock', 'owner', Number.NaN, 1)).toBe(false);
    expect(renewAppJobLock('lock', 'owner', 1, 0)).toBe(false);
    expect(releaseAppJobLock('', 'owner')).toBe(false);
    expect(releaseAppJobLock('lock', '')).toBe(false);
  });
});
