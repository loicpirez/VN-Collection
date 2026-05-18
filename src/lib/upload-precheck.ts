import { NextResponse } from 'next/server';

/**
 * R5-122 — pre-check `Content-Length` before reading `req.formData()`.
 *
 * `req.formData()` buffers the entire multipart body into memory
 * before returning, so a 10 GB upload to a `cover/` route would
 * fully buffer in process memory before the route's `file.size`
 * check rejected it. This helper consults the `Content-Length`
 * header up front so an oversized payload returns 413 without
 * touching the body. The post-formData `file.size` check is kept
 * as belt-and-suspenders for chunked / no-length uploads.
 *
 * Returns a `NextResponse` to return to the client when the
 * header exceeds the cap, or `null` to continue.
 */
export function precheckContentLength(
  req: Request,
  maxBytes: number,
): NextResponse | null {
  const raw = req.headers.get('content-length');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > maxBytes) {
    return NextResponse.json(
      {
        error: `payload too large (${(n / 1024 / 1024).toFixed(1)} MB, max ${(maxBytes / 1024 / 1024).toFixed(1)} MB)`,
      },
      { status: 413 },
    );
  }
  return null;
}
