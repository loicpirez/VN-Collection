import { db, listReadingQueue } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import type { HomeSectionState } from '@/lib/home-section-layout';
import { ReadingQueueStripView, type ReadingQueueEntry } from './ReadingQueueStripView';

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
 * when empty so it doesn't take vertical space on fresh installs, or when
 * the user has hidden the section via the per-strip menu.
 *
 * Server-rendered for the DB read; the interactive controls live in the
 * client `ReadingQueueStripView` so they can call /api/settings and react
 * to the home-layout CustomEvent without re-fetching the queue.
 */
export async function ReadingQueueStrip({ initialState }: { initialState?: HomeSectionState }) {
  const t = await getDict();
  const queue = listReadingQueue();
  if (queue.length === 0) return null;
  const ids = queue.map((q) => q.vn_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, title, image_thumb, image_url, image_sexual, local_image_thumb FROM vn WHERE id IN (${placeholders})`)
    .all(...ids) as QueueVn[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const entries: ReadingQueueEntry[] = queue
    .map((q, index) => {
      const v = byId.get(q.vn_id);
      if (!v) return null;
      return {
        position: index + 1,
        vn_id: v.id,
        title: v.title,
        image_url: v.image_url,
        image_thumb: v.image_thumb,
        local_image_thumb: v.local_image_thumb,
        image_sexual: v.image_sexual,
      };
    })
    .filter((e): e is ReadingQueueEntry => e !== null);

  return (
    <ReadingQueueStripView
      title={t.readingQueue.title}
      entries={entries}
      initialState={initialState}
    />
  );
}
