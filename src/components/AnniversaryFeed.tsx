import { todaysAnniversaries } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import type { HomeSectionState } from '@/lib/home-section-layout';
import { AnniversaryFeedView, type AnniversaryEntry } from './AnniversaryFeedView';

/**
 * Surfaces VNs whose release date's month/day matches today, anywhere in
 * the collection. Rendered above the library grid on the home page;
 * hidden entirely when nothing matches so it doesn't take vertical space
 * on most days, or when the user has hidden the section via the
 * per-strip menu.
 *
 * Server-rendered DB read; interactive controls live in
 * AnniversaryFeedView so the home-layout PATCH / event flow stays
 * client-side.
 */
export async function AnniversaryFeed({ initialState }: { initialState?: HomeSectionState }) {
  const t = await getDict();
  const rows = todaysAnniversaries();
  // Always hand control to the client view, even when there are no
  // anniversaries today. The previous "return null on empty" branch
  // made the section invisible AND unreachable from the per-section
  // menu, so users who hid it (or who simply have no VN released on
  // this calendar day) thought the feature was broken. The client
  // view now renders a clear empty-state with a hint and keeps the
  // hide/collapse controls reachable.

  const entries: AnniversaryEntry[] = rows.slice(0, 8).map((r) => ({
    id: r.id,
    title: r.title,
    years: r.years,
    image_url: r.image_url ?? null,
    image_thumb: r.image_thumb ?? null,
    local_image_thumb: r.local_image_thumb ?? null,
    image_sexual: r.image_sexual ?? null,
  }));

  return (
    <AnniversaryFeedView
      title={t.anniversary.title}
      yearsAgoTemplate={t.anniversary.yearsAgo}
      emptyHint={t.anniversary.emptyHint}
      entries={entries}
      initialState={initialState}
    />
  );
}
