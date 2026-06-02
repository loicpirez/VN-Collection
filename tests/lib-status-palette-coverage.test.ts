/**
 * Coverage for `src/lib/status-palette.ts` — the hex source of truth fed
 * into inline SVG fills / chart colours. Pure constants + a fallback
 * lookup; no mocks.
 */
import { describe, expect, it } from 'vitest';
import { STATUS_HEX, STATUS_HEX_FALLBACK, statusHex, type StatusKey } from '@/lib/status-palette';

describe('status-palette', () => {
  it('exposes the canonical five status hex codes', () => {
    expect(STATUS_HEX).toEqual({
      planning: '#475569',
      playing: '#3b82f6',
      completed: '#22c55e',
      on_hold: '#f59e0b',
      dropped: '#ef4444',
    });
  });

  it('statusHex returns the mapped colour for every known key', () => {
    for (const key of Object.keys(STATUS_HEX) as StatusKey[]) {
      expect(statusHex(key)).toBe(STATUS_HEX[key]);
    }
  });

  it('statusHex returns the muted fallback for an unknown status', () => {
    expect(statusHex('wishlist')).toBe(STATUS_HEX_FALLBACK);
    expect(statusHex('')).toBe(STATUS_HEX_FALLBACK);
    expect(STATUS_HEX_FALLBACK).toBe('#64748b');
  });
});
