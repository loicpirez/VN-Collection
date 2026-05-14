'use client';
import Link from 'next/link';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

interface Tag {
  id: string;
  name: string;
  rating: number;
  spoiler: number;
  lie?: boolean;
  category?: 'cont' | 'ero' | 'tech' | null;
}

/**
 * VNDB-style tag chip row that filters by the global spoiler level.
 * Sexual ("ero") tags are gated by `showSexualTraits` so the user has
 * one switch for adult content and another for plot-level spoilers.
 */
export function VnTagChips({ tags, max = 16 }: { tags: Tag[]; max?: number }) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const visible = tags
    .filter((tag) => {
      if (tag.spoiler > settings.spoilerLevel) return false;
      if (!settings.showSexualTraits && tag.category === 'ero') return false;
      return true;
    })
    .slice(0, max);
  if (visible.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <Link
          key={tag.id}
          href={`/?tag=${encodeURIComponent(tag.id)}`}
          className={`rounded-md border bg-bg-elev px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent ${
            tag.lie
              ? 'border-status-on_hold/40 text-status-on_hold'
              : tag.spoiler > 0
                ? 'border-status-on_hold/30 text-muted'
                : tag.category === 'ero'
                  ? 'border-status-dropped/30 text-status-dropped'
                  : 'border-border text-muted'
          }`}
          title={tag.lie ? t.detail.tagLie : t.library.filterByTag}
        >
          {tag.name}
          {tag.lie && <span className="ml-1 text-[9px]">⚠</span>}
          {tag.spoiler > 0 && <span className="ml-1 text-[9px]">!</span>}
        </Link>
      ))}
    </div>
  );
}
