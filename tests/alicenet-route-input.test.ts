import { describe, expect, it } from 'vitest';
import { parseKobeBatch, parseKobeBoolean, parseKobeRunStartedAt } from '@/lib/kobe-route-input';

describe('AliceNet Kobe route input parsing', () => {
  it('uses the route fallback only when batch is omitted', () => {
    expect(parseKobeBatch(undefined, 5, 20)).toEqual({ ok: true, value: 5 });
  });

  it('accepts bounded integer batches', () => {
    expect(parseKobeBatch(20, 5, 20)).toEqual({ ok: true, value: 20 });
  });

  it('rejects fractional, string, and oversized batches', () => {
    expect(parseKobeBatch(1.5, 5, 20).ok).toBe(false);
    expect(parseKobeBatch('5', 5, 20).ok).toBe(false);
    expect(parseKobeBatch(21, 5, 20).ok).toBe(false);
  });

  it('accepts an omitted or positive integer run timestamp only', () => {
    expect(parseKobeRunStartedAt(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseKobeRunStartedAt(1_700_000_000_000)).toEqual({ ok: true, value: 1_700_000_000_000 });
    expect(parseKobeRunStartedAt(1.5).ok).toBe(false);
    expect(parseKobeRunStartedAt('1700000000000').ok).toBe(false);
  });

  it('accepts omitted and exact boolean controls without truthy coercion', () => {
    expect(parseKobeBoolean(undefined, 'retry_none')).toEqual({ ok: true, value: false });
    expect(parseKobeBoolean(true, 'retry_none')).toEqual({ ok: true, value: true });
    expect(parseKobeBoolean(false, 'retry_none')).toEqual({ ok: true, value: false });
    expect(parseKobeBoolean('true', 'retry_none')).toEqual({ ok: false, error: 'retry_none must be boolean' });
  });
});
