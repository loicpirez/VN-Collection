'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useDisplaySettings } from '@/lib/settings/client';
import { SpoilerChip } from './SpoilerChip';
import {
  filterAndGroupTags,
  tagLinks,
  type RawVnTag,
  type TagSpoilerMode,
  type TagViewMode,
} from '@/lib/vn-tags-grouped';

interface Props {
  tags: RawVnTag[];
}

/**
 * The VN detail page's overhauled tag block. Replaces the flat
 * top-16 `<VnTagChips>` with three category sections (Content /
 * Sexual / Technical), a Summary-vs-All toggle, a Spoiler-mode
 * toggle, and per-chip dual affordance:
 *
 *   - clicking the tag name routes to the Library filter
 *   - a tiny "VNDB" chip opens the canonical vndb.org tag page
 *
 * The chip already encodes spoiler / sexual gating via the existing
 * `<SpoilerChip>` (see `SpoilerReveal`-style click-to-reveal); this
 * view stays headless of that policy and lets `<SpoilerChip>` do
 * the work, so the user's global spoiler settings keep their effect
 * even when the per-tag mode is widened.
 *
 * Child / parent tag relations are not surfaced because the VNDB
 * `/vn/{id}` payload does not include the parent/child DAG on
 * `tags{…}` — only the per-VN rating/spoiler/lie/category triple.
 * See `lib/vndb.ts:TAG_FULL_SUB` for the exact subselection.
 */
export function VnTagsGroupedView({ tags }: Props) {
  const t = useT();
  const { settings } = useDisplaySettings();
  // Local UI state — neither the view mode nor the spoiler mode is
  // worth promoting to the URL: they're a single-card decision the
  // operator makes while reading. The global spoiler setting still
  // governs sexual / lie gating via SpoilerChip.
  const [view, setView] = useState<TagViewMode>('summary');
  const [spoilerMode, setSpoilerMode] = useState<TagSpoilerMode>(() => {
    if (settings.spoilerLevel === 2) return 'all';
    if (settings.spoilerLevel === 1) return 'minor';
    return 'none';
  });

  if (!tags || tags.length === 0) return null;
  const grouped = filterAndGroupTags(tags, { spoilerMode, view });
  const total = grouped.cont.length + grouped.ero.length + grouped.tech.length;
  if (total === 0) {
    return (
      <div className="mt-2 rounded-md border border-border bg-bg-elev/30 p-2 text-xs text-muted">
        {t.vnTags.emptyAfterFilter}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="font-bold uppercase tracking-wider text-muted">
          {t.vnTags.viewLabel}
        </span>
        <ToggleChip pressed={view === 'summary'} onClick={() => setView('summary')}>
          {t.vnTags.viewSummary}
        </ToggleChip>
        <ToggleChip pressed={view === 'all'} onClick={() => setView('all')}>
          {t.vnTags.viewAll}
        </ToggleChip>
        <span className="mx-1 text-muted/40">·</span>
        <span className="font-bold uppercase tracking-wider text-muted">
          {t.vnTags.spoilerLabel}
        </span>
        <ToggleChip pressed={spoilerMode === 'none'} onClick={() => setSpoilerMode('none')}>
          {t.vnTags.spoilerNone}
        </ToggleChip>
        <ToggleChip pressed={spoilerMode === 'minor'} onClick={() => setSpoilerMode('minor')}>
          {t.vnTags.spoilerMinor}
        </ToggleChip>
        <ToggleChip pressed={spoilerMode === 'all'} onClick={() => setSpoilerMode('all')}>
          {t.vnTags.spoilerAll}
        </ToggleChip>
      </div>

      {grouped.cont.length > 0 && (
        <TagSection title={t.vnTags.categoryContent} tags={grouped.cont} settings={settings} />
      )}
      {grouped.ero.length > 0 && (
        <TagSection title={t.vnTags.categorySexual} tags={grouped.ero} settings={settings} />
      )}
      {grouped.tech.length > 0 && (
        <TagSection title={t.vnTags.categoryTechnical} tags={grouped.tech} settings={settings} />
      )}
    </div>
  );
}

function TagSection({
  title,
  tags,
  settings,
}: {
  title: string;
  tags: RawVnTag[];
  settings: { spoilerLevel: number; showSexualTraits: boolean };
}) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const links = tagLinks(tag.id);
          return (
            <span key={tag.id} className="inline-flex items-stretch overflow-hidden rounded-md">
              <SpoilerChip
                level={tag.spoiler}
                sexual={tag.category === 'ero'}
                lie={tag.lie}
                currentSpoilerLevel={settings.spoilerLevel}
                showSexual={settings.showSexualTraits}
                href={links.libraryHref}
                title={`${tag.name} — ${tag.rating.toFixed(1)} / 3`}
              >
                <span className="inline-flex items-center gap-1">
                  {tag.name}
                  {tag.lie && <AlertTriangle className="h-2.5 w-2.5" aria-hidden />}
                  <span
                    className="ml-0.5 rounded bg-bg-elev/80 px-1 text-[9px] font-bold tabular-nums text-muted"
                    aria-label={`rating ${tag.rating.toFixed(1)}`}
                  >
                    {tag.rating.toFixed(1)}
                  </span>
                </span>
              </SpoilerChip>
              {/* Second affordance: external VNDB tag page. Pinned
                  here as a tiny pill so the reader can pivot to
                  VNDB's authoritative page without losing the
                  inline-Library affordance. */}
              <a
                href={links.vndbExternal}
                target="_blank"
                rel="noopener noreferrer"
                className="-ml-px inline-flex items-center rounded-r-md border border-l-0 border-border bg-bg-elev/40 px-1 text-[9px] uppercase tracking-wider text-muted hover:border-accent hover:text-accent"
                aria-label="VNDB"
                title="VNDB"
              >
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              </a>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`rounded-md border px-1.5 py-0.5 transition-colors ${
        pressed
          ? 'border-accent bg-accent/15 text-accent font-bold'
          : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}
