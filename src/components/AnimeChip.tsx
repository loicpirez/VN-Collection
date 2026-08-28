import { Tv } from 'lucide-react';
import { vndbAdvancedSearchCachedRaw, vndbAdvancedSearchRaw } from '@/lib/vndb-recommend';
import { getDict } from '@/lib/i18n/server';

import { isVndbVnId } from '@/lib/vn-id-shape';

const ANIME_PROBE_BUDGET_MS = 350;

interface AnimeProbeResult {
  completed: boolean;
  hasAnime: boolean;
}

function createAnimeProbeBudget(): { promise: Promise<AnimeProbeResult>; cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout>;
  const promise = new Promise<AnimeProbeResult>((resolve) => {
    timeout = setTimeout(
      () => resolve({ completed: false, hasAnime: false }),
      ANIME_PROBE_BUDGET_MS,
    );
  });
  return { promise, cancel: () => clearTimeout(timeout) };
}

async function probeAnimeWithinRenderBudget(filters: unknown): Promise<boolean> {
  const probe = vndbAdvancedSearchRaw({ filters, results: 1 })
    .then((hits): AnimeProbeResult => ({ completed: true, hasAnime: hits.length > 0 }))
    .catch((): AnimeProbeResult => ({ completed: true, hasAnime: false }));
  const budget = createAnimeProbeBudget();
  const result = await Promise.race([probe, budget.promise]);
  budget.cancel();
  return result.completed && result.hasAnime;
}

/**
 * Surfaces an "Anime adaptation exists" chip on the VN detail page when
 * VNDB flags the VN with has_anime. We probe the filter rather than the
 * field (VNDB doesn't expose has_anime as a selectable field). A fresh or
 * positive cached result renders immediately. A cache miss gets a short
 * render budget while the shared request continues warming the cache, so an
 * optional badge can never hold the VN document stream open on a slow network.
 *
 * Skips entirely for egs_-only synthetic ids since VNDB has no record.
 */
export async function AnimeChip({ vnId }: { vnId: string }) {
  if (!isVndbVnId(vnId)) return null;
  const t = await getDict();
  const filters = ['and', ['id', '=', vnId], ['has_anime', '=', 1]];
  let hasAnime: boolean;
  try {
    const cached = await vndbAdvancedSearchCachedRaw({ filters, results: 1 });
    if (cached.fresh) {
      hasAnime = cached.hits.length > 0;
    } else if (cached.hits.length > 0) {
      hasAnime = true;
      void vndbAdvancedSearchRaw({ filters, results: 1 }).catch(() => undefined);
    } else {
      hasAnime = await probeAnimeWithinRenderBudget(filters);
    }
  } catch {
    return null;
  }
  if (!hasAnime) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent"
      title={t.animeChip.tooltip}
    >
      <Tv className="h-3 w-3" aria-hidden /> {t.animeChip.label}
    </span>
  );
}
