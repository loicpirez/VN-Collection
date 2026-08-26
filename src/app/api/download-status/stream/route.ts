import { NextRequest } from 'next/server';
import { subscribeStatus } from '@/lib/download-status';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { buildDownloadStatusSnapshot } from '@/lib/download-status-payload';
import { registerServerShutdownHandler } from '@/lib/server-shutdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function buildSnapshot(): Promise<string> {
  const data = await buildDownloadStatusSnapshot();
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Server-Sent Events stream of the download-status snapshot. The
 * polling fallback at `/api/download-status` still works (used in
 * browsers where EventSource is blocked), but most clients should
 * subscribe here instead: events are pushed within ms of any job
 * mutation, with no fixed polling cost when nothing's happening.
 *
 * Keep-alive comment is sent every 25 s so reverse proxies don't
 * silently terminate idle SSE connections. The throttle's
 * retryAfterMs is included in every snapshot — clients tick a local
 * countdown between events to keep the UI smooth without forcing a
 * re-emit on the server every second.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const encoder = new TextEncoder();
  let aborted = false;
  let cleanedUp = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let unregisterShutdown: (() => void) | null = null;
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    aborted = true;
    if (keepAlive) clearInterval(keepAlive);
    unsubscribe?.();
    unregisterShutdown?.();
    req.signal.removeEventListener('abort', cleanup);
    try {
      activeController?.close();
    } catch {
      // Already closed by the runtime.
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      activeController = controller;
      function push(payload: string) {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          aborted = true;
          cleanup();
        }
      }

      const pushSnapshot = async () => {
        const snapshot = await buildSnapshot();
        push(snapshot);
      };
      void pushSnapshot();
      if (cleanedUp) return;

      unsubscribe = subscribeStatus(() => {
        void pushSnapshot();
      });

      keepAlive = setInterval(() => {
        push(': keep-alive\n\n');
      }, 25_000);

      req.signal.addEventListener('abort', cleanup);
      unregisterShutdown = registerServerShutdownHandler(cleanup);
    },
    // Fired by Next.js / undici when the consumer cancels the stream
    // without firing the request abort signal — make sure we still
    // release the keep-alive timer and listener.
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
