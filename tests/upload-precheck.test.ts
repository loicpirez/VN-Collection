/**
 * R5-122 pin: `precheckContentLength` returns a 413 NextResponse when
 * the `Content-Length` header exceeds the cap, and `null` otherwise.
 *
 * Five existing multipart upload routes (cover, banner, producer
 * logo, series image, backup restore) now wire this helper BEFORE
 * calling `req.formData()` — that's the only meaningful gate
 * before the entire body would otherwise buffer into memory. The
 * sixth (collection import) already had a hand-rolled equivalent.
 *
 * The helper is intentionally permissive on missing / non-finite
 * Content-Length headers — the route's post-formData `file.size`
 * check still covers those cases.
 */
import { describe, expect, it } from 'vitest';
import { precheckContentLength } from '@/lib/upload-precheck';

function mkReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', { method: 'POST', headers });
}

describe('precheckContentLength (R5-122)', () => {
  const ONE_MB = 1024 * 1024;
  const CAP = 10 * ONE_MB;

  it('returns null when no Content-Length is set', () => {
    expect(precheckContentLength(mkReq({}), CAP)).toBeNull();
  });

  it('returns null when Content-Length is within the cap', () => {
    expect(precheckContentLength(mkReq({ 'content-length': '1024' }), CAP)).toBeNull();
    expect(precheckContentLength(mkReq({ 'content-length': String(CAP) }), CAP)).toBeNull();
  });

  it('returns a 413 NextResponse when Content-Length exceeds the cap', async () => {
    const res = precheckContentLength(
      mkReq({ 'content-length': String(CAP + 1) }),
      CAP,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
    const body = await res!.json();
    expect(body.error).toMatch(/payload too large/);
    expect(body.error).toMatch(/MB/);
  });

  it('returns null when Content-Length is non-numeric (lets the post-buffer check decide)', () => {
    expect(precheckContentLength(mkReq({ 'content-length': 'abc' }), CAP)).toBeNull();
  });

  it('returns null when Content-Length is zero or negative', () => {
    expect(precheckContentLength(mkReq({ 'content-length': '0' }), CAP)).toBeNull();
    expect(precheckContentLength(mkReq({ 'content-length': '-1' }), CAP)).toBeNull();
  });
});
