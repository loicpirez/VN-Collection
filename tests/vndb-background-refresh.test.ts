import { describe, expect, it, vi } from 'vitest';
import { scheduleVndbBackgroundRefresh } from '@/lib/vndb-background-refresh';

describe('VNDB background refresh coordinator', () => {
  it('accepts one task, rejects overlap, and releases the lane after success', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const first = vi.fn(() => pending);
    const skipped = vi.fn(async () => undefined);

    expect(scheduleVndbBackgroundRefresh(first)).toBe(true);
    expect(scheduleVndbBackgroundRefresh(skipped)).toBe(false);
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    expect(skipped).not.toHaveBeenCalled();

    finish();
    await pending;
    await vi.waitFor(() => expect(scheduleVndbBackgroundRefresh(skipped)).toBe(true));
    await vi.waitFor(() => expect(skipped).toHaveBeenCalledOnce());
  });

  it('contains a rejected task and releases the lane', async () => {
    const rejected = vi.fn(async () => {
      throw new Error('offline');
    });
    const next = vi.fn(async () => undefined);

    expect(scheduleVndbBackgroundRefresh(rejected)).toBe(true);
    await vi.waitFor(() => expect(rejected).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(scheduleVndbBackgroundRefresh(next)).toBe(true));
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
  });
});
