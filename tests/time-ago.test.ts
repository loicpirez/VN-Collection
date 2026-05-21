import { describe, expect, it } from 'vitest';
import { timeAgo } from '@/lib/time-ago';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const t = {
  timeAgo: {
    never: 'never',
    justNow: 'just now',
    minutes: '{n}m ago',
    hours: '{n}h ago',
    days: '{n}d ago',
    weeks: '{n}w ago',
    months: '{n}mo ago',
    years: '{n}y ago',
  },
} as unknown as Dictionary;

const NOW = 1_700_000_000_000;

describe('timeAgo', () => {
  it('returns never when ts is null', () => {
    expect(timeAgo(null, t, NOW)).toBe('never');
  });

  it('returns never when ts is undefined', () => {
    expect(timeAgo(undefined, t, NOW)).toBe('never');
  });

  it('returns just now when diff < 1 minute', () => {
    expect(timeAgo(NOW - 30_000, t, NOW)).toBe('just now');
  });

  it('returns just now when diff is 0', () => {
    expect(timeAgo(NOW, t, NOW)).toBe('just now');
  });

  it('returns just now when ts is in the future (diff clamped to 0)', () => {
    expect(timeAgo(NOW + 5_000, t, NOW)).toBe('just now');
  });

  it('returns minutes for 1–59 minutes', () => {
    expect(timeAgo(NOW - 5 * 60_000, t, NOW)).toBe('5m ago');
    expect(timeAgo(NOW - 59 * 60_000, t, NOW)).toBe('59m ago');
  });

  it('returns hours for 1–23 hours', () => {
    expect(timeAgo(NOW - 3 * 3_600_000, t, NOW)).toBe('3h ago');
    expect(timeAgo(NOW - 23 * 3_600_000, t, NOW)).toBe('23h ago');
  });

  it('returns days for 1–6 days', () => {
    expect(timeAgo(NOW - 1 * 86_400_000, t, NOW)).toBe('1d ago');
    expect(timeAgo(NOW - 6 * 86_400_000, t, NOW)).toBe('6d ago');
  });

  it('returns weeks for 7–29 days', () => {
    expect(timeAgo(NOW - 7 * 86_400_000, t, NOW)).toBe('1w ago');
    expect(timeAgo(NOW - 14 * 86_400_000, t, NOW)).toBe('2w ago');
    expect(timeAgo(NOW - 29 * 86_400_000, t, NOW)).toBe('4w ago');
  });

  it('returns months for 30–364 days', () => {
    expect(timeAgo(NOW - 30 * 86_400_000, t, NOW)).toBe('1mo ago');
    expect(timeAgo(NOW - 90 * 86_400_000, t, NOW)).toBe('3mo ago');
    expect(timeAgo(NOW - 364 * 86_400_000, t, NOW)).toBe('12mo ago');
  });

  it('returns years for 365+ days', () => {
    expect(timeAgo(NOW - 365 * 86_400_000, t, NOW)).toBe('1y ago');
    expect(timeAgo(NOW - 730 * 86_400_000, t, NOW)).toBe('2y ago');
  });

  it('uses Date.now() when now is omitted', () => {
    const recent = Date.now() - 10_000;
    expect(timeAgo(recent, t)).toBe('just now');
  });
});
