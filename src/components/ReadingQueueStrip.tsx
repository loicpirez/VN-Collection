import { db, listReadingQueue } from '@/lib/db';
import { getDict, getLocale } from '@/lib/i18n/server';
import { getReadingSpeedProfile, predictReadingMinutes } from '@/lib/reading-speed';
import type { HomeSectionState } from '@/lib/home-section-layout';
import { ReadingQueueStripView, type ReadingQueueEntry } from './ReadingQueueStripView';

interface QueueVn {
  id: string;
  title: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
  length_minutes: number | null;
  egs_minutes: number | null;
}

const VN_QUERY_CHUNK = 500;

/**
 * Home-page strip listing the VNs the user has explicitly queued (distinct
 * from the "Planning" status - Planning is intent, Queue is order). Hidden
 * when empty so it doesn't take vertical space on fresh installs, or when
 * the user has hidden the section via the per-strip menu.
 *
 * Server-rendered for the DB read and the personal reading-speed estimate
 * (predictReadingMinutes is server-only); the interactive controls and the
 * drag-reorder live in the client `ReadingQueueStripView`.
 */
export async function ReadingQueueStrip({ initialState }: { initialState?: HomeSectionState }) {
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const queue = listReadingQueue();
  if (queue.length === 0) return null;
  const ids = queue.map((q) => q.vn_id);
  const rows: QueueVn[] = [];
  for (let index = 0; index < ids.length; index += VN_QUERY_CHUNK) {
    const chunk = ids.slice(index, index + VN_QUERY_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    rows.push(
      ...(db
        .prepare(
          `SELECT v.id, v.title, v.image_thumb, v.image_url, v.image_sexual, v.local_image_thumb,
                  v.length_minutes, e.playtime_median_minutes AS egs_minutes
             FROM vn v
        LEFT JOIN egs_game e ON e.vn_id = v.id
            WHERE v.id IN (${placeholders})`,
        )
        .all(...chunk) as QueueVn[]),
    );
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const profile = getReadingSpeedProfile();
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
        predictedMinutes: predictReadingMinutes(v.length_minutes, v.egs_minutes, profile),
      };
    })
    .filter((e): e is ReadingQueueEntry => e !== null);

  return (
    <ReadingQueueStripView
      title={t.readingQueue.title}
      entries={entries}
      initialState={initialState}
      locale={locale}
      units={{ hoursUnit: t.year.hoursUnit, minutesUnit: t.year.minutesUnit }}
      reorderHint={t.lists.reorderHint}
      reorderKeyboardHint={t.lists.reorderKeyboardHint}
      youLabel={t.readingSpeed.you}
      errorLabel={t.common.error}
    />
  );
}
