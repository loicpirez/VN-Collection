'use client';
import { useDisplaySettings } from '@/lib/settings/client';
import { SpoilerChip } from './SpoilerChip';

interface Tag {
  id: string;
  name: string;
  rating: number;
  spoiler: number;
  lie?: boolean;
  category?: 'cont' | 'ero' | 'tech' | null;
}

/**
 * VNDB-style tag row. Every tag is rendered, but tags whose `spoiler`
 * exceeds the global toggle (or `category === 'ero'` when sexual is off)
 * are rendered as a redacted lock placeholder. Clicking the placeholder
 * reveals just that tag with a warning border so the user knows what
 * they uncovered.
 */
export function VnTagChips({ tags, max = 16 }: { tags: Tag[]; max?: number }) {
  const { settings } = useDisplaySettings();
  if (!tags.length) return null;
  const visible = tags.slice(0, max);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <SpoilerChip
          key={tag.id}
          level={tag.spoiler}
          sexual={tag.category === 'ero'}
          lie={tag.lie}
          currentSpoilerLevel={settings.spoilerLevel}
          showSexual={settings.showSexualTraits}
          href={`/?tag=${encodeURIComponent(tag.id)}`}
        >
          {tag.name}
        </SpoilerChip>
      ))}
    </div>
  );
}
