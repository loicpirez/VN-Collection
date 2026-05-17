'use client';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useRecentlyViewed } from '@/lib/recentlyViewed';
import { useT } from '@/lib/i18n/client';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import type { HomeSectionState } from '@/lib/home-section-layout';

interface Props {
  /** Initial visibility / collapse from server-read layout. */
  initialState?: HomeSectionState;
}

export function RecentlyViewedStrip({ initialState }: Props) {
  const t = useT();
  const { items, clear } = useRecentlyViewed();
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'recently-viewed',
    initialState,
  );

  // Skip rendering entirely when:
  //   • the section is hidden by user pref (restorable from Settings), OR
  //   • there's no recently-viewed data yet (avoids an empty card).
  if (isHidden || items.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
          <Clock className="h-3.5 w-3.5 text-accent" aria-hidden /> {t.recently.title}
          <span className="text-[10px] font-normal opacity-70">· {items.length}</span>
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          onClearData={clear}
          clearLabel={t.recently.clear}
          sectionLabel={t.recently.title}
        />
      </div>
      {!isCollapsed && (
        <div className="scroll-fade-right flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/vn/${it.id}`}
              className="group flex w-24 shrink-0 flex-col gap-1"
              title={it.title}
            >
              <div className="aspect-[2/3] w-24 overflow-hidden rounded-md border border-border transition-colors group-hover:border-accent">
                <SafeImage
                  src={it.poster}
                  localSrc={it.localPoster}
                  sexual={it.sexual}
                  alt={it.title}
                  className="h-full w-full"
                />
              </div>
              <span className="line-clamp-2 text-[10px] leading-tight text-muted transition-colors group-hover:text-white">
                {it.title}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
