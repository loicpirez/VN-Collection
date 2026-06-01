import { describe, expect, it } from 'vitest';
import { decodeAssetDownloadResult } from '../src/lib/asset-download-shape';

describe('asset download response adapter', () => {
  it('decodes success, degradation warning, and failure responses', () => {
    expect(decodeAssetDownloadResult({ ok: true, egs_warning: null })).toEqual({
      ok: true,
      error: null,
      egs_warning: null,
    });
    expect(decodeAssetDownloadResult({
      ok: true,
      egs_warning: { kind: 'throttled', status: 429 },
    })?.egs_warning).toEqual({ kind: 'throttled', status: 429 });
    expect(decodeAssetDownloadResult({ error: 'sync failed', egs_warning: null })).toEqual({
      ok: false,
      error: 'sync failed',
      egs_warning: null,
    });
  });

  it('rejects malformed envelopes and warnings', () => {
    expect(decodeAssetDownloadResult({ ok: true, egs_warning: { kind: 'bad', status: 500 } })).toBeNull();
    expect(decodeAssetDownloadResult({ ok: true, egs_warning: { kind: 'network', status: 700 } })).toBeNull();
    expect(decodeAssetDownloadResult({ egs_warning: null })).toBeNull();
    expect(decodeAssetDownloadResult([])).toBeNull();
  });
});
