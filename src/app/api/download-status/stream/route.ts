import { NextRequest } from 'next/server';
import { listJobs, subscribeStatus } from '@/lib/download-status';
import { enrichJobs } from '@/lib/download-status-names';
import { getVndbThrottleStats } from '@/lib/vndb-throttle';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { mergeDurableStockBatchJobs } from '@/lib/stock-batch-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildSnapshot(): string {
  const data = {
    throttle: getVndbThrottleStats(),
    jobs: enrichJobs(mergeDurableStockBatchJobs(listJobs())),
  };
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
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    aborted = true;
    if (keepAlive) clearInterval(keepAlive);
    unsubscribe?.();
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

      push(buildSnapshot());
      if (cleanedUp) return;

      unsubscribe = subscribeStatus(() => push(buildSnapshot()));

      keepAlive = setInterval(() => {
        push(': keep-alive\n\n');
      }, 25_000);

      req.signal.addEventListener('abort', cleanup);
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
