import { describe, expect, it } from 'vitest';
import { parseAliceNetBatch, parseAliceNetBoolean, parseAliceNetRunStartedAt } from '@/lib/alicenet-route-input';

describe('AliceNet route input parsing', () => {
  it('uses the route fallback only when batch is omitted', () => {
    expect(parseAliceNetBatch(undefined, 5, 20)).toEqual({ ok: true, value: 5 });
  });

  it('accepts bounded integer batches', () => {
    expect(parseAliceNetBatch(20, 5, 20)).toEqual({ ok: true, value: 20 });
  });

  it('rejects fractional, string, and oversized batches', () => {
    expect(parseAliceNetBatch(1.5, 5, 20).ok).toBe(false);
    expect(parseAliceNetBatch('5', 5, 20).ok).toBe(false);
    expect(parseAliceNetBatch(21, 5, 20).ok).toBe(false);
  });

  it('accepts an omitted or positive integer run timestamp only', () => {
    expect(parseAliceNetRunStartedAt(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseAliceNetRunStartedAt(1_700_000_000_000)).toEqual({ ok: true, value: 1_700_000_000_000 });
    expect(parseAliceNetRunStartedAt(1.5).ok).toBe(false);
    expect(parseAliceNetRunStartedAt('1700000000000').ok).toBe(false);
  });

  it('accepts omitted and exact boolean controls without truthy coercion', () => {
    expect(parseAliceNetBoolean(undefined, 'retry_none')).toEqual({ ok: true, value: false });
    expect(parseAliceNetBoolean(true, 'retry_none')).toEqual({ ok: true, value: true });
    expect(parseAliceNetBoolean(false, 'retry_none')).toEqual({ ok: true, value: false });
    expect(parseAliceNetBoolean('true', 'retry_none')).toEqual({ ok: false, error: 'retry_none must be boolean' });
  });
});
