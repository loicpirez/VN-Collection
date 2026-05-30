/**
 * R5-SEC-008 pin: `readBodyWithLimit` enforces the byte cap DURING the
 * stream read — it aborts the moment the running counter crosses the cap
 * (cancelling the reader so the socket tears down) rather than buffering the
 * whole payload first. `reparseWithLimit` then replays the capped bytes into
 * a fresh Request so `formData()` parses a body proven within the cap.
 *
 * A forged / absent `Content-Length` is irrelevant here: these helpers never
 * read that header, they count bytes off `req.body` directly.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  readBodyWithLimit,
  reparseWithLimit,
  PayloadTooLargeError,
} from '@/lib/read-limited-body';

const ONE_KB = 1024;

/**
 * Build a Request whose body is a `ReadableStream` emitting `count` chunks of
 * `chunkBytes` each, so the test can assert mid-stream cap enforcement and
 * reader cancellation. Exposes a `cancel` spy via the returned tuple.
 */
function streamingReq(
  count: number,
  chunkBytes: number,
): { req: Request; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn(() => Promise.resolve());
  let emitted = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= count) {
        controller.close();
        return;
      }
      emitted += 1;
      controller.enqueue(new Uint8Array(chunkBytes));
    },
    cancel,
  });
  const req = new Request('http://localhost/test', {
    method: 'POST',
    body: stream,
    // @ts-expect-error duplex is required by undici for a stream body
    duplex: 'half',
  });
  return { req, cancel };
}

describe('readBodyWithLimit (R5-SEC-008)', () => {
  it('returns the full buffer when the streamed body is within the cap', async () => {
    const { req } = streamingReq(4, ONE_KB);
    const buf = await readBodyWithLimit(req, 8 * ONE_KB);
    expect(buf.byteLength).toBe(4 * ONE_KB);
  });

  it('throws PayloadTooLargeError carrying maxBytes once the stream crosses the cap', async () => {
    const { req } = streamingReq(100, ONE_KB);
    await expect(readBodyWithLimit(req, 8 * ONE_KB)).rejects.toMatchObject({
      name: 'PayloadTooLargeError',
      maxBytes: 8 * ONE_KB,
    });
  });

  it('cancels the reader on cap-hit instead of draining the whole stream', async () => {
    const { req, cancel } = streamingReq(1000, ONE_KB);
    await expect(readBodyWithLimit(req, 2 * ONE_KB)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('applies the cap on the arrayBuffer fallback when req.body is null', async () => {
    const oversize = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(4 * ONE_KB),
    });
    Object.defineProperty(oversize, 'body', { value: null, configurable: true });
    await expect(readBodyWithLimit(oversize, ONE_KB)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });
});

describe('reparseWithLimit (R5-SEC-008)', () => {
  it('replays capped multipart bytes so the new Request parses via formData', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(2 * ONE_KB)]), 'logo.png');
    const original = new Request('http://localhost/test', { method: 'POST', body: fd });
    const bounded = await reparseWithLimit(original, 8 * ONE_KB);
    const parsed = await bounded.formData();
    expect(parsed.get('file')).toBeInstanceOf(File);
    expect((parsed.get('file') as File).size).toBe(2 * ONE_KB);
  });

  it('throws PayloadTooLargeError when the streamed body exceeds the cap', async () => {
    const { req } = streamingReq(50, ONE_KB);
    await expect(reparseWithLimit(req, 8 * ONE_KB)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });
});
