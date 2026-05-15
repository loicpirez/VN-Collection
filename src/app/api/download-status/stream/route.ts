import { listJobs, subscribeStatus } from '@/lib/download-status';
import { getVndbThrottleStats } from '@/lib/vndb-throttle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildSnapshot(): string {
  const data = {
    throttle: getVndbThrottleStats(),
    jobs: listJobs(),
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
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream({
    start(controller) {
      function push(payload: string) {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          aborted = true;
        }
      }

      push(buildSnapshot());

      const unsubscribe = subscribeStatus(() => push(buildSnapshot()));

      const keepAlive = setInterval(() => {
        push(': keep-alive\n\n');
      }, 25_000);

      const close = () => {
        if (aborted) return;
        aborted = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      req.signal.addEventListener('abort', close);
    },
    cancel() {
      aborted = true;
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
