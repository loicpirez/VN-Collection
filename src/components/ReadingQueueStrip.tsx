import { getDict, getLocale } from '@/lib/i18n/server';
import { getReadingSpeedProfile, predictReadingMinutes } from '@/lib/reading-speed';
import { getHomeFeedRepository } from '@/lib/db/repositories/home-feed';
import type { HomeSectionState } from '@/lib/home-section-layout';
import { ReadingQueueStripView, type ReadingQueueEntry } from './ReadingQueueStripView';

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
  const rows = await getHomeFeedRepository().listReadingQueueVns();
  if (rows.length === 0) return null;
  const profile = await getReadingSpeedProfile();
  const entries: ReadingQueueEntry[] = rows.map((row, index) => ({
    position: index + 1,
    vn_id: row.vn_id,
    title: row.title,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    local_image_thumb: row.local_image_thumb,
    image_sexual: row.image_sexual,
    predictedMinutes: predictReadingMinutes(row.length_minutes, row.egs_minutes, profile),
  }));

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
