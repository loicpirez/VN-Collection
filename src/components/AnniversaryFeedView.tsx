'use client';
import Link from 'next/link';
import { CakeSlice } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import type { HomeSectionState } from '@/lib/home-section-layout';

export interface AnniversaryEntry {
  id: string;
  title: string;
  years: number;
  image_url: string | null;
  image_thumb: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

interface Props {
  title: string;
  /** "{n}" placeholder template — substituted client-side per entry. */
  yearsAgoTemplate: string;
  /** Copy shown when no anniversary matches today. Lets the user know
   *  the section is wired and tells them what would populate it. */
  emptyHint: string;
  entries: AnniversaryEntry[];
  initialState?: HomeSectionState;
}

/**
 * Client-side renderer for AnniversaryFeed. Owns the visibility /
 * collapse state via `useHomeSection`; the parent server component
 * supplies the data so the DB read stays on the server.
 */
export function AnniversaryFeedView({ title, yearsAgoTemplate, emptyHint, entries, initialState }: Props) {
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'anniversary',
    initialState,
  );
  if (isHidden) return null;
  // Auto-hide on days with no anniversaries so the section doesn't
  // sit there saying "Nothing today" and contribute to the dead
  // space at the top of the home page. The section is still
  // reachable from the home-layout editor (it stays in the
  // registered order), so discoverability is preserved without
  // the empty-state visual noise. Mirrors `RecentlyViewedStrip`
  // and `ReadingQueueStrip`, both of which already auto-hide.
  if (entries.length === 0) return null;

  return (
    <aside className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent">
          <CakeSlice className="h-3.5 w-3.5" aria-hidden /> {title}
          {entries.length > 0 && (
            <span className="text-[10px] font-normal text-accent/80">· {entries.length}</span>
          )}
        </h3>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
        />
      </div>
      {/*
        emptyHint is intentionally unused now — the early return
        above skips the section entirely when there are no
        anniversaries, so this template branch only renders the
        populated list. Keep the prop in the signature so the
        server component can keep its placeholder copy in i18n
        without a type-system handshake change.
      */}
      {!isCollapsed && (
        <ul className="flex flex-wrap gap-2">
          {entries.map((r) => (
            <li key={r.id}>
              <Link
                href={`/vn/${r.id}`}
                className="group flex items-center gap-2 rounded-md bg-bg-card/80 px-2 py-1 text-xs hover:bg-bg-card"
              >
                <div className="h-8 w-6 overflow-hidden rounded">
                  <SafeImage
                    src={r.image_url || r.image_thumb}
                    localSrc={r.local_image_thumb}
                    sexual={r.image_sexual}
                    alt={r.title}
                    className="h-full w-full"
                  />
                </div>
                <span className="flex flex-col">
                  <span className="line-clamp-1 max-w-[200px] font-semibold transition-colors group-hover:text-accent">
                    {r.title}
                  </span>
                  <span className="text-[10px] text-muted">
                    {yearsAgoTemplate.replace('{n}', String(r.years))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
