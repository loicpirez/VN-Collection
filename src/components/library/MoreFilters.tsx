'use client';
import { Check, Circle, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export type FilterKey =
  | 'match_vndb'
  | 'match_egs'
  | 'only_egs_only'
  | 'fan_disc'
  | 'has_notes'
  | 'has_custom_cover'
  | 'has_banner'
  | 'is_favorite'
  | 'has_released'
  | 'is_nsfw'
  | 'is_nukige'
  | 'in_reading_queue'
  | 'in_list';

/**
 * Inline tri-state flag panel. Always rendered (no inner collapse);
 * this lives inside the parent `<AdvancedFiltersDrawer>` so it
 * doesn't need its own collapse toggle. Having two nested "Filtres
 * avancés" controls (the outer drawer + the inner MoreFilters
 * collapse) was the duplicate-Filters bug the user flagged.
 *
 * Loaded lazily via `next/dynamic` from `LibraryClient` so its
 * module chunk only ships once the user opens the Advanced Filters
 * drawer; it is never on the library first-paint path.
 */
export function MoreFilters({
  values,
  onCycle,
  onReset,
  t,
}: {
  values: Record<FilterKey, string | null>;
  onCycle: (key: FilterKey) => void;
  onReset: () => void;
  t: ReturnType<typeof useT>;
}) {
  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'match_vndb', label: t.library.moreFilters.matchVndb },
    { key: 'match_egs', label: t.library.moreFilters.matchEgs },
    { key: 'only_egs_only', label: t.library.moreFilters.onlyEgsOnly },
    { key: 'fan_disc', label: t.library.moreFilters.fanDisc },
    { key: 'is_favorite', label: t.library.moreFilters.isFavorite },
    { key: 'has_notes', label: t.library.moreFilters.hasNotes },
    { key: 'has_custom_cover', label: t.library.moreFilters.hasCustomCover },
    { key: 'has_banner', label: t.library.moreFilters.hasBanner },
    { key: 'has_released', label: t.library.moreFilters.hasReleased },
    { key: 'is_nsfw', label: t.library.moreFilters.isNsfw },
    { key: 'is_nukige', label: t.library.moreFilters.isNukige },
    { key: 'in_reading_queue', label: t.library.moreFilters.inReadingQueue },
    { key: 'in_list', label: t.nav.lists },
  ];
  const activeCount = FILTERS.filter((f) => values[f.key] === '1' || values[f.key] === '0').length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-card/40 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">
        {t.library.moreFilters.flagsTitle}
        {activeCount > 0 && (
          <span className="ml-2 rounded-full bg-accent/20 px-1.5 text-[10px] font-bold normal-case text-accent">
            {activeCount}
          </span>
        )}
      </p>
      <p className="mb-2 text-[10px] text-muted/80">{t.library.moreFilters.hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const v = values[key];
          const tone = v === '1' ? 'yes' : v === '0' ? 'no' : 'off';
          return (
            <button
              key={key}
              type="button"
              onClick={() => onCycle(key)}
              aria-pressed={tone === 'yes' ? true : tone === 'no' ? 'mixed' : false}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                tone === 'yes'
                  ? 'border-status-completed bg-status-completed/15 text-status-completed'
                  : tone === 'no'
                    ? 'border-status-dropped bg-status-dropped/15 text-status-dropped'
                    : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              title={t.library.moreFilters.cycleHint}
            >
              <span className="inline-flex items-center justify-center" aria-hidden>
                {tone === 'yes' ? <Check className="h-3 w-3" /> : tone === 'no' ? <X className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 text-[10px] text-muted hover:text-status-dropped"
        >
          {t.library.moreFilters.resetAll}
        </button>
      )}
    </div>
  );
}
