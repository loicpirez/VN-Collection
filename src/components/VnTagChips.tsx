'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
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
 *
 * The section now also exposes a "Spoil me" toggle which raises the
 * effective spoiler level for THIS section only. The toggle never
 * lowers the level — the global "Hide all" intent always wins for
 * surfaces the user hasn't explicitly opted into.
 */
export function VnTagChips({ tags, max = 16, perSectionOverride }: { tags: Tag[]; max?: number; perSectionOverride?: 0 | 1 | 2 | null }) {
  const t = useT();
  const { settings } = useDisplaySettings();
  // Per-section local override — the URL `?spoil=…` flag seeds it,
  // but the user can also flip it inline via the "Spoil me" / "Hide
  // all" button. The local override never persists across reloads.
  const [localOverride, setLocalOverride] = useState<0 | 1 | 2 | null>(perSectionOverride ?? null);
  const effectiveOverride = localOverride;
  // Effective spoiler level surfaced to SpoilerChip, max'd with the
  // override so a section opt-in raises the level above the global
  // setting.
  const effectiveLevel = Math.max(settings.spoilerLevel, effectiveOverride ?? 0) as 0 | 1 | 2;
  if (!tags.length) return null;
  const visible = tags.slice(0, max);
  const hasHiddenTag = visible.some((tag) => tag.spoiler > effectiveLevel);
  return (
    <div className="mt-2 space-y-1.5">
      {(hasHiddenTag || effectiveOverride != null) && (
        <button
          type="button"
          onClick={() => setLocalOverride((v) => (v === 2 ? null : 2))}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-accent hover:text-accent"
          aria-pressed={effectiveOverride === 2}
          title={effectiveOverride === 2 ? t.spoiler.hideAll : t.spoiler.spoilMe}
        >
          {effectiveOverride === 2 ? (
            <>
              <EyeOff className="h-2.5 w-2.5" aria-hidden /> {t.spoiler.hideAll}
            </>
          ) : (
            <>
              <Eye className="h-2.5 w-2.5" aria-hidden /> {t.spoiler.spoilMe}
            </>
          )}
        </button>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visible.map((tag) => (
          <SpoilerChip
            key={tag.id}
            level={tag.spoiler}
            sexual={tag.category === 'ero'}
            lie={tag.lie}
            currentSpoilerLevel={effectiveLevel}
            showSexual={settings.showSexualTraits}
            href={`/?tag=${encodeURIComponent(tag.id)}`}
          >
            {tag.name}
          </SpoilerChip>
        ))}
      </div>
    </div>
  );
}
