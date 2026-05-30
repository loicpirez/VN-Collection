import 'server-only';

/**
 * R5-SEC-008 — thrown by {@link readBodyWithLimit} the moment the accumulated
 * request body exceeds the per-route cap. Carries `maxBytes` so the route
 * handler can emit a stable 413 message without re-deriving the limit.
 */
export class PayloadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`payload too large (max ${maxBytes} bytes)`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * R5-SEC-008 — drain a request body into a Buffer while enforcing `maxBytes`
 * DURING the read, not after.
 *
 * `req.formData()` / `req.arrayBuffer()` buffer the entire body before
 * returning, and {@link import('@/lib/upload-precheck').precheckContentLength}
 * only consults the `Content-Length` header — which a hostile client can omit
 * (chunked transfer-encoding) or forge to a small value while streaming
 * gigabytes. This reads `req.body` through the WHATWG `ReadableStream` reader
 * with a running byte counter and throws {@link PayloadTooLargeError} as soon
 * as the counter crosses the cap, cancelling the reader so the socket is torn
 * down instead of buffering the whole payload first.
 *
 * The returned Buffer can be handed to a reconstructed `Request` to run
 * `formData()` parsing on bytes that are now provably within the cap.
 *
 * When the body has already been consumed or was never a stream (e.g. some
 * test fixtures), it falls back to `arrayBuffer()` and applies the same cap.
 *
 * @throws {PayloadTooLargeError} when the accumulated bytes exceed `maxBytes`.
 */
export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<Buffer> {
  const body = req.body;
  if (!body) {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new PayloadTooLargeError(maxBytes);
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('payload too large').catch(() => undefined);
        throw new PayloadTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

/**
 * R5-SEC-008 — drain `req` with {@link readBodyWithLimit} and return a fresh
 * `Request` that replays the capped bytes, so a subsequent `.formData()` /
 * `.arrayBuffer()` parses a body proven to be within `maxBytes`.
 *
 * The original method, URL, and headers (including the multipart `Content-Type`
 * boundary) are preserved so framework multipart parsing is unaffected.
 *
 * @throws {PayloadTooLargeError} when the accumulated bytes exceed `maxBytes`.
 */
export async function reparseWithLimit(req: Request, maxBytes: number): Promise<Request> {
  const buf = await readBodyWithLimit(req, maxBytes);
  const body = new Uint8Array(buf.byteLength);
  body.set(buf);
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
  });
}
