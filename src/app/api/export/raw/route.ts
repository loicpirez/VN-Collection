import { db } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stream the entire VNDB raw cache as one JSON document. Every byte
 * VNDB has ever returned for any entity (VN / producer / character /
 * staff / release / tag / trait / quote / full-fan-out / scrape) lives
 * keyed in `vndb_cache`, so this single dump covers everything.
 *
 * The cache can grow to hundreds of MB. We MUST NOT buffer it: we walk
 * rows one at a time via better-sqlite3's `iterate()` and stream each
 * one out as JSON, separated by newlines, wrapped in an outer
 * `{ exported_at, entry_count, entries: [ ... ] }`. That keeps Node's
 * heap flat regardless of cache size — the previous implementation
 * crashed dev with a 528 MB cache.
 *
 * Output remains valid JSON (parseable by any standard JSON reader).
 */
export async function GET(req: Request) {
  // The raw cache contains every authenticated /authinfo and /ulist
  // response — including the user's full VNDB list contents and
  // permissions. PII. Gate.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const exportedAt = Date.now();
  const countRow = db
    .prepare('SELECT COUNT(*) AS n FROM vndb_cache')
    .get() as { n: number };

  // Iterator lives at the closure level so `cancel()` (fired when
  // the client disconnects mid-stream) can dispose of the prepared
  // statement handle. Earlier versions leaked the handle on
  // cancelled exports, which compounded over many runs.
  let iter:
    | IterableIterator<{
        cache_key: string;
        body: string;
        etag: string | null;
        last_modified: string | null;
        fetched_at: number;
        expires_at: number;
      }>
    | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      try {
        controller.enqueue(
          encoder.encode(
            `{\n  "exported_at": ${exportedAt},\n  "entry_count": ${countRow.n},\n  "entries": [\n`,
          ),
        );

        iter = db
          .prepare(
            'SELECT cache_key, body, etag, last_modified, fetched_at, expires_at FROM vndb_cache ORDER BY cache_key',
          )
          .iterate() as IterableIterator<{
            cache_key: string;
            body: string;
            etag: string | null;
            last_modified: string | null;
            fetched_at: number;
            expires_at: number;
          }>;

        let first = true;
        for (const r of iter) {
          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(r.body);
          } catch {
            parsedBody = r.body;
          }
          const piece = JSON.stringify({
            cache_key: r.cache_key,
            etag: r.etag,
            last_modified: r.last_modified,
            fetched_at: r.fetched_at,
            expires_at: r.expires_at,
            body: parsedBody,
          });
          controller.enqueue(encoder.encode(first ? `    ${piece}` : `,\n    ${piece}`));
          first = false;
          parsedBody = undefined;
        }

        controller.enqueue(encoder.encode('\n  ]\n}\n'));
        controller.close();
        iter = null;
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      // Client disconnect: dispose of the iterator so better-sqlite3
      // releases the statement handle.
      if (iter && typeof iter.return === 'function') {
        try {
          iter.return(undefined);
        } catch {
          // best-effort
        }
      }
      iter = null;
    },
  });

  const filename = `vndb-raw-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
