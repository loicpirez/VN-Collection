import { describe, expect, it } from 'vitest';
import { decodeProxyTestResult } from '../src/lib/proxy-test-shape';

describe('proxy test response adapter', () => {
  it('decodes successful and failed probes', () => {
    expect(decodeProxyTestResult({ ok: true, latencyMs: 12, status: 204 })).toEqual({
      ok: true,
      latencyMs: 12,
      status: 204,
    });
    expect(decodeProxyTestResult({ ok: false, latencyMs: 8, error: 'blocked' })).toEqual({
      ok: false,
      latencyMs: 8,
      error: 'blocked',
    });
  });

  it('rejects malformed probe envelopes', () => {
    expect(decodeProxyTestResult({ ok: true, latencyMs: -1, status: 200 })).toBeNull();
    expect(decodeProxyTestResult({ ok: true, latencyMs: 1, status: 700 })).toBeNull();
    expect(decodeProxyTestResult({ ok: false, latencyMs: 1 })).toBeNull();
    expect(decodeProxyTestResult({ error: 'not configured' })).toBeNull();
  });
});
