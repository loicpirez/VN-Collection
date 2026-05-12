import { Tv } from 'lucide-react';
import { vndbAdvancedSearchRaw } from '@/lib/vndb-recommend';
import { getDict } from '@/lib/i18n/server';

/**
 * Surfaces an "Anime adaptation exists" chip on the VN detail page when
 * VNDB flags the VN with has_anime. We probe the filter rather than the
 * field (VNDB doesn't expose has_anime as a selectable field) — a single
 * cached lookup per VN, the result is true/false.
 *
 * Skips entirely for egs_-only synthetic ids since VNDB has no record.
 */
export async function AnimeChip({ vnId }: { vnId: string }) {
  if (!/^v\d+$/i.test(vnId)) return null;
  const t = await getDict();
  let hasAnime = false;
  try {
    const hits = await vndbAdvancedSearchRaw({
      filters: ['and', ['id', '=', vnId], ['has_anime', '=', 1]],
      results: 1,
    });
    hasAnime = hits.length > 0;
  } catch {
    return null;
  }
  if (!hasAnime) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent"
      title={t.animeChip.tooltip}
    >
      <Tv className="h-3 w-3" /> {t.animeChip.label}
    </span>
  );
}
