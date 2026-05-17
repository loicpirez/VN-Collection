'use client';
import Link from 'next/link';
import { ListOrdered } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import type { HomeSectionState } from '@/lib/home-section-layout';

export interface ReadingQueueEntry {
  position: number;
  vn_id: string;
  title: string;
  image_url: string | null;
  image_thumb: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

interface Props {
  title: string;
  entries: ReadingQueueEntry[];
  initialState?: HomeSectionState;
}

/**
 * Client-side renderer for ReadingQueueStrip. Owns the visibility /
 * collapse state via `useHomeSection`; the parent server component
 * supplies the queue data (so the DB query stays on the server).
 */
export function ReadingQueueStripView({ title, entries, initialState }: Props) {
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'reading-queue',
    initialState,
  );
  if (isHidden) return null;

  return (
    <aside className="mb-4 rounded-xl border border-border bg-bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
          <ListOrdered className="h-3.5 w-3.5 text-accent" aria-hidden /> {title}
          <span className="text-[10px] font-normal text-muted">· {entries.length}</span>
        </h3>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          sectionLabel={title}
        />
      </div>
      {!isCollapsed && (
        <ol className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <li key={e.vn_id}>
              <Link
                href={`/vn/${e.vn_id}`}
                className="group flex items-center gap-2 rounded-md bg-bg-elev/40 px-2 py-1 text-xs hover:bg-bg-elev"
              >
                <span className="font-mono text-[10px] text-muted">{e.position}</span>
                <div className="h-8 w-6 overflow-hidden rounded">
                  <SafeImage
                    src={e.image_url || e.image_thumb}
                    localSrc={e.local_image_thumb}
                    sexual={e.image_sexual}
                    alt={e.title}
                    className="h-full w-full"
                  />
                </div>
                <span className="line-clamp-1 max-w-[200px] font-semibold transition-colors group-hover:text-accent">
                  {e.title}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
