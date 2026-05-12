import Link from 'next/link';
import { ListOrdered } from 'lucide-react';
import { db, listReadingQueue } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from './SafeImage';

interface QueueVn {
  id: string;
  title: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

/**
 * Home-page strip listing the VNs the user has explicitly queued (distinct
 * from the "Planning" status — Planning is intent, Queue is order). Hidden
 * when empty so it doesn't take vertical space on fresh installs.
 *
 * Server-rendered; the QueueButton on /vn/[id] is what populates / drains
 * the table.
 */
export async function ReadingQueueStrip() {
  const t = await getDict();
  const queue = listReadingQueue();
  if (queue.length === 0) return null;
  const ids = queue.map((q) => q.vn_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, title, image_thumb, image_url, image_sexual, local_image_thumb FROM vn WHERE id IN (${placeholders})`)
    .all(...ids) as QueueVn[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return (
    <aside className="mb-4 rounded-xl border border-border bg-bg-card p-3">
      <h3 className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
        <ListOrdered className="h-3.5 w-3.5 text-accent" /> {t.readingQueue.title}
        <span className="text-[10px] font-normal text-muted">· {queue.length}</span>
      </h3>
      <ol className="flex flex-wrap gap-2">
        {queue.map((q, i) => {
          const v = byId.get(q.vn_id);
          if (!v) return null;
          return (
            <li key={q.vn_id}>
              <Link
                href={`/vn/${v.id}`}
                className="group flex items-center gap-2 rounded-md bg-bg-elev/40 px-2 py-1 text-xs hover:bg-bg-elev"
              >
                <span className="font-mono text-[10px] text-muted">{i + 1}</span>
                <div className="h-8 w-6 overflow-hidden rounded">
                  <SafeImage
                    src={v.image_thumb || v.image_url}
                    localSrc={v.local_image_thumb}
                    sexual={v.image_sexual ?? null}
                    alt={v.title}
                    className="h-full w-full"
                  />
                </div>
                <span className="line-clamp-1 max-w-[200px] font-semibold transition-colors group-hover:text-accent">
                  {v.title}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
