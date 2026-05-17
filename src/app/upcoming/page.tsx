import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, Flame, Globe, Library as LibraryIcon } from 'lucide-react';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection, type UpcomingRelease } from '@/lib/upcoming';
import { EgsUnreachable, fetchEgsAnticipatedPage, type EgsAnticipated } from '@/lib/erogamescape';
import { fetchVnCovers, type VndbCoverInfo } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { db, getCacheFreshness } from '@/lib/db';
import { SkeletonRows } from '@/components/Skeleton';
import { RefreshPageButton } from '@/components/RefreshPageButton';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { UpcomingCard, type UpcomingCardData } from '@/components/UpcomingCard';
import { brandHref, yearHref } from '@/lib/egs-links';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.upcoming };
}

type Tab = 'collection' | 'anticipated' | 'all';

function parseTab(value: string | undefined): Tab {
  if (value === 'anticipated' || value === 'all') return value;
  return 'collection';
}

function bucket(rel: UpcomingRelease): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rel.released)) return rel.released.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(rel.released)) return rel.released;
  if (/^\d{4}$/.test(rel.released)) return rel.released;
  return 'TBA';
}

function groupByMonth(rels: UpcomingRelease[]): Map<string, UpcomingRelease[]> {
  const map = new Map<string, UpcomingRelease[]>();
  for (const r of rels) {
    const k = bucket(r);
    const cur = map.get(k);
    if (cur) cur.push(r);
    else map.set(k, [r]);
  }
  return map;
}

const ANTICIPATED_PAGE_SIZE = 50;

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(20, n);
}

export default async function UpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const t = await getDict();
  const { tab: rawTab, page: rawPage } = await searchParams;
  const tab = parseTab(rawTab);
  const page = parsePage(rawPage);
  // Per-tab freshness: the Anticipated tab reads EGS cache rows
  // (`egs:anticipated:%`) while the All / Collection tabs read
  // VNDB release caches (`% /release|%`, `% /release:%`). Mixing
  // both into one MAX hid stale-EGS state behind a fresh VNDB
  // refresh. Scope the lookup to the active tab.
  const lastUpdatedAt =
    tab === 'anticipated'
      ? getCacheFreshness(['egs:anticipated:%'])
      : getCacheFreshness(['% /release|%', '% /release:%']);

  return (
    <DensityScopeProvider scope="upcoming" className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
              <CalendarRange className="h-6 w-6 text-accent" /> {t.upcoming.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{t.upcoming.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <CardDensitySlider scope="upcoming" />
            <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
          </div>
        </div>
        <nav className="mt-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs">
          <TabLink href="/upcoming" active={tab === 'collection'} icon={<LibraryIcon className="h-3.5 w-3.5" />}>
            {t.upcoming.tabCollection}
          </TabLink>
          <TabLink href="/upcoming?tab=anticipated" active={tab === 'anticipated'} icon={<Flame className="h-3.5 w-3.5" />}>
            {t.upcoming.tabAnticipated}
          </TabLink>
          <TabLink href="/upcoming?tab=all" active={tab === 'all'} icon={<Globe className="h-3.5 w-3.5" />}>
            {t.upcoming.tabAll}
          </TabLink>
        </nav>
      </header>

      <Suspense key={`${tab}-${page}`} fallback={<UpcomingTabSkeleton tab={tab} />}>
        <TabContent tab={tab} page={page} t={t} />
      </Suspense>
    </DensityScopeProvider>
  );
}

async function TabContent({ tab, page, t }: { tab: Tab; page: number; t: Dictionary }) {
  try {
    if (tab === 'anticipated') {
      const { rows, hasMore, stale, fetchedAt } = await fetchEgsAnticipatedPage(
        page,
        ANTICIPATED_PAGE_SIZE,
      );
      // Most anticipated entries already carry a VNDB id (the card title
      // links there). Batch-fetch their cover URLs in a single VNDB call
      // so we can show the high-quality VNDB poster directly instead of
      // bouncing through the EGS resolver / shop CDNs.
      const vndbIds = rows.map((r) => r.vndb_id).filter((v): v is string => !!v);
      const vndbCovers = await fetchVnCovers(vndbIds);
      return (
        <>
          {stale && (
            <StaleEgsBanner fetchedAt={fetchedAt ?? null} t={t} />
          )}
          <AnticipatedSection rows={rows} vndbCovers={vndbCovers} t={t} startRank={(page - 1) * ANTICIPATED_PAGE_SIZE} />
          <AnticipatedPaginator page={page} hasMore={hasMore} t={t} />
        </>
      );
    }
    if (tab === 'all') {
      const rows = await fetchAllUpcomingFromVndb(200);
      return <ReleasesSection rows={rows} empty={t.upcoming.emptyAll} t={t} />;
    }
    const rows = await fetchUpcomingForCollection();
    return <ReleasesSection rows={rows} empty={t.upcoming.empty} t={t} />;
  } catch (e) {
    // EGS unreachable AND no cached payload at all: actionable state.
    if (e instanceof EgsUnreachable) {
      return (
        <div className="rounded-xl border border-status-on_hold/40 bg-status-on_hold/10 p-4 text-sm">
          <p className="font-bold text-status-on_hold">{t.upcoming.egsUnreachableTitle}</p>
          <p className="mt-1 text-[12px] text-muted">{t.upcoming.egsUnreachableHint}</p>
        </div>
      );
    }
    return (
      <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
        {(e as Error).message}
      </div>
    );
  }
}

function StaleEgsBanner({ fetchedAt, t }: { fetchedAt: number | null; t: Dictionary }) {
  // Human-readable absolute timestamp (browser-local); the user can
  // see when the cache was last refreshed and decide whether to
  // trigger a Refresh.
  const when = fetchedAt
    ? new Date(fetchedAt).toLocaleString()
    : '—';
  return (
    <div
      className="mb-4 rounded-lg border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-[12px] text-status-on_hold"
      role="status"
    >
      <p className="font-semibold">{t.upcoming.staleNoticeTitle}</p>
      <p className="mt-0.5 text-[11px] opacity-90">
        {t.upcoming.staleNoticeBody.replace('{when}', when)}
      </p>
    </div>
  );
}

/**
 * Page-range pagination for EGS Anticipated. EGS's SQL form
 * supports LIMIT/OFFSET cleanly so deeper pages are real data,
 * not a UI illusion. We expose 20 pages of headroom (1000 rows);
 * the EGS pool of "next 365 days with at least one user vote"
 * is realistically far smaller, so most users will hit a "no
 * more" state long before that cap.
 */
function AnticipatedPaginator({
  page,
  hasMore,
  t,
}: {
  page: number;
  hasMore: boolean;
  t: Dictionary;
}) {
  const startRank = (page - 1) * 50 + 1;
  const endRank = page * 50;
  const prevHref = `/upcoming?tab=anticipated${page > 2 ? `&page=${page - 1}` : ''}`;
  const nextHref = `/upcoming?tab=anticipated&page=${page + 1}`;
  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-card/60 px-3 py-2 text-xs"
      aria-label={t.upcoming.anticipatedPaginationLabel}
    >
      <span className="text-muted tabular-nums">
        {t.upcoming.anticipatedRankRange
          .replace('{from}', startRank.toLocaleString())
          .replace('{to}', endRank.toLocaleString())}
      </span>
      <div className="inline-flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={prevHref}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-muted hover:border-accent hover:text-accent"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden /> {t.upcoming.prevPage}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted opacity-40">
            <ChevronLeft className="h-3 w-3" aria-hidden /> {t.upcoming.prevPage}
          </span>
        )}
        {hasMore ? (
          <Link
            href={nextHref}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
          >
            {t.upcoming.nextPage} <ChevronRight className="h-3 w-3" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted opacity-40">
            {t.upcoming.nextPage} <ChevronRight className="h-3 w-3" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

function UpcomingTabSkeleton({ tab }: { tab: Tab }) {
  // Anticipated renders 2-per-row big cards with a 128×192 (152×224 sm+)
  // poster on the left and a wide info column on the right. Mirror that
  // shape with skeleton blocks so the layout doesn't jump when the data
  // resolves.
  if (tab === 'anticipated') {
    return (
      <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 sm:p-5">
        <div className="mb-4 h-3 w-72 rounded bg-bg-elev/60 animate-pulse" />
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex gap-4 rounded-xl border border-border bg-bg-elev/40 p-3 sm:p-4">
              <div className="h-48 w-32 shrink-0 animate-pulse rounded-lg bg-bg-elev sm:h-56 sm:w-36" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-5 w-5/6 rounded bg-bg-elev/80 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-bg-elev/60 animate-pulse" />
                <div className="flex gap-1.5">
                  <div className="h-7 w-20 rounded-md bg-bg-elev/60 animate-pulse" />
                  <div className="h-7 w-20 rounded-md bg-bg-elev/60 animate-pulse" />
                  <div className="h-7 w-20 rounded-md bg-bg-elev/60 animate-pulse" />
                </div>
                <div className="flex gap-3">
                  <div className="h-3 w-10 rounded bg-bg-elev/40 animate-pulse" />
                  <div className="h-3 w-10 rounded bg-bg-elev/40 animate-pulse" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return <SkeletonRows count={6} />;
}

function TabLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // aria-current marks the active tab for screen readers; without
      // it the only signal was a color change, which AT can't perceive.
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
        active ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

interface LocalVnCover {
  url: string | null;
  thumb: string | null;
  local: string | null;
  local_thumb: string | null;
  sexual: number | null;
}

/**
 * VNDB's `/release` endpoint sometimes returns `vns[].image = null` for
 * upcoming entries (cover not uploaded yet). For VNs already in the
 * collection we have richer data locally — including a mirrored
 * cover. Look up every referenced VN id in one shot and overlay.
 */
function loadLocalCovers(rows: UpcomingRelease[]): Map<string, LocalVnCover> {
  const ids = Array.from(
    new Set(rows.flatMap((r) => r.vns.map((v) => v.id)).filter((id) => /^v\d+$/i.test(id))),
  );
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const localRows = db
    .prepare(
      `SELECT id, image_url, image_thumb, image_sexual, local_image, local_image_thumb
       FROM vn WHERE id IN (${placeholders})`,
    )
    .all(...ids) as Array<{
      id: string;
      image_url: string | null;
      image_thumb: string | null;
      image_sexual: number | null;
      local_image: string | null;
      local_image_thumb: string | null;
    }>;
  const map = new Map<string, LocalVnCover>();
  for (const r of localRows) {
    map.set(r.id, {
      url: r.image_url,
      thumb: r.image_thumb,
      local: r.local_image,
      local_thumb: r.local_image_thumb,
      sexual: r.image_sexual,
    });
  }
  return map;
}

function loadCollectionMembership(ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${placeholders})`)
    .all(...ids) as Array<{ vn_id: string }>;
  return new Set(rows.map((r) => r.vn_id));
}

function ReleasesSection({
  rows,
  empty,
  t,
}: {
  rows: UpcomingRelease[];
  empty: string;
  t: Dictionary;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">{empty}</p>
    );
  }
  const localCovers = loadLocalCovers(rows);
  const vnIds = rows.flatMap((r) => r.vns.map((v) => v.id)).filter((id) => /^v\d+$/i.test(id));
  const inCollectionIds = loadCollectionMembership(vnIds);
  const grouped = groupByMonth(rows);
  return (
    <>
      {Array.from(grouped.entries()).map(([month, rels]) => (
        <section key={month} className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {month} · <span className="opacity-70">{rels.length}</span>
          </h2>
          {/*
            Density-responsive grid: column min follows the slider
            (with min(100%, …) so mobile doesn't overflow). The
            inner cover scales via clamp() so it visibly grows /
            shrinks as the user drags the slider — at the default
            density (~220px) the previous floor of 80px clamped
            the cover so it looked frozen. The new formula puts
            the floor below the default value and bumps the
            multiplier so the cover starts moving at every slider
            tick. The 240px column floor keeps the accompanying
            text readable on narrow viewports.
          */}
          <ul
            className="grid gap-3"
            // Density-aware grid — removed `max(240px, ...)` floor so
            // the slider can take the column count below 240px.
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 240px)), 1fr))' }}
          >
            {rels.map((r) => {
              const v = r.vns[0];
              const local = v ? localCovers.get(v.id) : undefined;
              const remoteFromRel = v?.image?.url || v?.image?.thumbnail || null;
              const finalRemote = remoteFromRel || local?.url || local?.thumb || null;
              const finalLocal = local?.local || local?.local_thumb || null;
              const finalSexual = v?.image?.sexual ?? local?.sexual ?? null;
              const data: UpcomingCardData = {
                id: v?.id ?? r.id,
                vndbId: v?.id ?? null,
                egsId: null,
                title: r.title,
                alttitle: r.alttitle,
                released: r.released,
                coverUrl: finalRemote,
                coverLocal: finalLocal,
                coverSexual: finalSexual,
                inCollection: v ? inCollectionIds.has(v.id) : false,
                variant: 'compact',
                meta: (
                  <>
                    <div className="text-[11px] text-muted">
                      {r.producers.filter((p) => p.id).slice(0, 3).map((p, i, arr) => (
                        <Link key={p.id} href={`/producer/${p.id}`} className="hover:text-accent">
                          {p.name}{i < arr.length - 1 ? ' · ' : ''}
                        </Link>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                      {r.patch && <span className="rounded bg-status-on_hold/25 px-1.5 py-0.5 uppercase text-status-on_hold">{t.releases.patch}</span>}
                      {r.freeware && <span className="rounded bg-accent-blue/25 px-1.5 py-0.5 uppercase text-accent-blue">{t.releases.freeware}</span>}
                      {r.has_ero && <span className="rounded bg-status-dropped/25 px-1.5 py-0.5 uppercase text-status-dropped">{t.releases.hasEro}</span>}
                    </div>
                  </>
                ),
              };
              return (
                <li key={r.id}>
                  <UpcomingCard data={data} t={t} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function AnticipatedSection({
  rows,
  vndbCovers,
  t,
  startRank = 0,
}: {
  rows: EgsAnticipated[];
  vndbCovers: Map<string, VndbCoverInfo>;
  t: Dictionary;
  startRank?: number;
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">{t.upcoming.emptyAnticipated}</p>;
  }
  const vndbIds = rows.map((a) => a.vndb_id).filter((id): id is string => !!id);
  const inCollectionIds = loadCollectionMembership(vndbIds);
  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 sm:p-5">
      <p className="mb-4 text-[11px] text-muted">{t.upcoming.anticipatedSubtitle}</p>
      <ol
        className="grid gap-4 lg:gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))' }}
      >
        {rows.map((a, i) => {
          const vndbCover = a.vndb_id ? vndbCovers.get(a.vndb_id) ?? null : null;
          const coverSrc = vndbCover?.url ?? `/api/egs-cover/${a.egs_id}`;
          const coverSexual = vndbCover?.sexual ?? null;
          const cardData: UpcomingCardData = {
            id: a.vndb_id ?? `egs_${a.egs_id}`,
            vndbId: a.vndb_id,
            egsId: a.egs_id,
            title: a.gamename,
            coverUrl: coverSrc,
            coverSexual,
            inCollection: a.vndb_id ? inCollectionIds.has(a.vndb_id) : false,
            variant: 'wide',
            meta: (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                  {(() => {
                    const href = yearHref(a.sellday);
                    return href ? (
                      <Link
                        href={href}
                        className="rounded bg-bg-card px-2 py-0.5 font-mono uppercase tracking-wider text-accent hover:bg-accent/15"
                      >
                        {a.sellday}
                      </Link>
                    ) : (
                      <span className="rounded bg-bg-card px-2 py-0.5 font-mono uppercase tracking-wider text-accent">{a.sellday}</span>
                    );
                  })()}
                  {a.brand_name && (() => {
                    const href = brandHref(null, a.brand_name);
                    return href ? (
                      <Link href={href} className="line-clamp-1 hover:text-accent" title={a.brand_name}>
                        {a.brand_name}
                      </Link>
                    ) : (
                      <span className="line-clamp-1">{a.brand_name}</span>
                    );
                  })()}
                </div>
                <div className="mb-1 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 font-bold text-accent">
                    <span className="opacity-70">{t.upcoming.willBuy}</span>
                    <span className="text-sm">{a.will_buy}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-blue/15 px-2 py-1 font-bold text-accent-blue">
                    <span className="opacity-70">{t.upcoming.probablyBuy}</span>
                    <span className="text-sm">{a.probably_buy}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/15 px-2 py-1 font-bold text-muted">
                    <span className="opacity-70">{t.upcoming.watching}</span>
                    <span className="text-sm">{a.watching}</span>
                  </span>
                </div>
              </>
            ),
          };
          return (
            <li key={a.egs_id} className="relative">
              <span className="absolute -left-2 -top-2 z-10 flex h-8 min-w-8 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg shadow-card">
                {startRank + i + 1}
              </span>
              <UpcomingCard data={cardData} t={t} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
