import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Library as LibraryIcon, Sparkles, Star, Trophy } from 'lucide-react';
import { fetchVndbTopRanked, VNDB_TOP_MIN_VOTES, type VndbTopRanked } from '@/lib/top-ranked';
import { fetchEgsTopRanked, EGS_TOP_MIN_VOTES, type EgsTopRanked } from '@/lib/erogamescape';
import { fetchVnCovers, type VndbCoverInfo } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { db, getCacheFreshness } from '@/lib/db';
import { SafeImage } from '@/components/SafeImage';
import { SkeletonCardGrid } from '@/components/Skeleton';
import { RefreshPageButton } from '@/components/RefreshPageButton';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.topRanked.title };
}

type Tab = 'vndb' | 'egs';

function parseTab(value: string | undefined): Tab {
  return value === 'egs' ? 'egs' : 'vndb';
}

export default async function TopRankedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getDict();
  const { tab: rawTab } = await searchParams;
  const tab = parseTab(rawTab);
  const lastUpdatedAt = getCacheFreshness([
    '% /vn:top-ranked:%',
    'egs:top-ranked:%',
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
              <Trophy className="h-6 w-6 text-accent" aria-hidden /> {t.topRanked.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{t.topRanked.subtitle}</p>
          </div>
          <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
        </div>
        <nav
          className="mt-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
          aria-label={t.topRanked.tabsLabel}
          role="tablist"
        >
          <TabLink
            href="/top-ranked"
            active={tab === 'vndb'}
            icon={<LibraryIcon className="h-3.5 w-3.5" aria-hidden />}
          >
            {t.topRanked.tabVndb}
          </TabLink>
          <TabLink
            href="/top-ranked?tab=egs"
            active={tab === 'egs'}
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
          >
            {t.topRanked.tabEgs}
          </TabLink>
        </nav>
        <p className="mt-2 text-[10px] text-muted">
          {tab === 'vndb'
            ? t.topRanked.thresholdVndb.replace('{n}', String(VNDB_TOP_MIN_VOTES))
            : t.topRanked.thresholdEgs.replace('{n}', String(EGS_TOP_MIN_VOTES))}
        </p>
      </header>

      <Suspense key={tab} fallback={<SkeletonCardGrid count={12} />}>
        <TabContent tab={tab} t={t} />
      </Suspense>
    </div>
  );
}

async function TabContent({ tab, t }: { tab: Tab; t: Dictionary }) {
  try {
    if (tab === 'egs') {
      const rows = await fetchEgsTopRanked(100);
      if (rows.length === 0) {
        return <EmptyState message={t.topRanked.emptyEgs} />;
      }
      // VNDB cover wins when the EGS row carries a `vndb` id and VNDB
      // returned a poster — much higher quality than the EGS resolver
      // chain. Falls back per-row to `/api/egs-cover/{id}` otherwise.
      const vndbIds = rows.map((r) => r.vndb_id).filter((v): v is string => !!v);
      const covers = vndbIds.length > 0 ? await fetchVnCovers(vndbIds) : new Map<string, VndbCoverInfo>();
      return <EgsSection rows={rows} covers={covers} t={t} />;
    }
    const rows = await fetchVndbTopRanked(100);
    if (rows.length === 0) {
      return <EmptyState message={t.topRanked.emptyVndb} />;
    }
    return <VndbSection rows={rows} t={t} />;
  } catch (e) {
    return (
      <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
        {(e as Error).message}
      </div>
    );
  }
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-border bg-bg-card p-6 text-center text-sm text-muted">
      {message}
    </p>
  );
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
      role="tab"
      aria-selected={active}
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

/**
 * VNDB top-ranked section. Each row links to the local /vn/[id]
 * because we already mirror cached VN metadata; if the VN isn't in
 * the local DB yet, /vn/[id] auto-fetches on first visit.
 */
function VndbSection({ rows, t }: { rows: VndbTopRanked[]; t: Dictionary }) {
  // Overlay locally-mirrored covers when we have them (sharper than
  // VNDB's hosted thumbnail). Same trick the /upcoming page uses.
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const localRows = ids.length > 0
    ? (db
        .prepare(
          `SELECT id, local_image, local_image_thumb FROM vn WHERE id IN (${placeholders})`,
        )
        .all(...ids) as Array<{ id: string; local_image: string | null; local_image_thumb: string | null }>)
    : [];
  const locals = new Map(
    localRows.map((r) => [r.id, r.local_image || r.local_image_thumb || null] as const),
  );

  return (
    <section className="rounded-xl border border-border bg-bg-card p-3 sm:p-5">
      <ol
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {rows.map((v, i) => (
          <li
            key={v.id}
            className="group flex gap-2 rounded-lg border border-border bg-bg-elev/30 p-2 transition-colors hover:border-accent"
          >
            <Link
              href={`/vn/${v.id}`}
              className="relative block h-28 w-20 shrink-0 overflow-hidden rounded"
              aria-label={v.title}
            >
              <SafeImage
                src={v.image?.thumbnail ?? v.image?.url ?? null}
                localSrc={locals.get(v.id) ?? null}
                sexual={v.image?.sexual ?? null}
                alt={v.title}
                className="h-full w-full"
              />
              <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg shadow-card">
                {i + 1}
              </span>
            </Link>
            <div className="min-w-0 flex-1 text-[11px]">
              <Link
                href={`/vn/${v.id}`}
                className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent"
              >
                {v.title}
              </Link>
              {v.alttitle && v.alttitle !== v.title && (
                <p className="line-clamp-1 text-[10px] text-muted">{v.alttitle}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                {v.rating != null && (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <Star className="h-3 w-3 fill-accent" aria-hidden /> {(v.rating / 10).toFixed(1)}
                  </span>
                )}
                {v.votecount != null && (
                  <span className="opacity-70">
                    {t.topRanked.voteCount.replace('{n}', v.votecount.toLocaleString())}
                  </span>
                )}
                {v.released && <span className="tabular-nums">{v.released.slice(0, 4)}</span>}
              </div>
              {v.developers.length > 0 && (
                <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">
                  {v.developers.map((d) => d.name).join(' · ')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EgsSection({
  rows,
  covers,
  t,
}: {
  rows: EgsTopRanked[];
  covers: Map<string, VndbCoverInfo>;
  t: Dictionary;
}) {
  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-3 sm:p-5">
      <ol
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {rows.map((r, i) => {
          const vndbCover = r.vndb_id ? covers.get(r.vndb_id) ?? null : null;
          const coverSrc = vndbCover?.url ?? r.banner_url ?? `/api/egs-cover/${r.egs_id}`;
          const coverSexual = vndbCover?.sexual ?? null;
          // Click target: prefer the local /vn/[id] when we have a
          // VNDB id, otherwise drop the user on the EGS game page.
          // External link gets target="_blank" so it doesn't blow away
          // the user's tab.
          const isInternal = !!r.vndb_id;
          const href = isInternal
            ? `/vn/${r.vndb_id}`
            : `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${r.egs_id}`;
          const linkProps = isInternal
            ? {}
            : { target: '_blank', rel: 'noopener noreferrer' };
          return (
            <li
              key={r.egs_id}
              className="group flex gap-2 rounded-lg border border-border bg-bg-elev/30 p-2 transition-colors hover:border-accent"
            >
              <Link
                href={href}
                {...linkProps}
                className="relative block h-28 w-20 shrink-0 overflow-hidden rounded"
                aria-label={r.gamename}
              >
                <SafeImage
                  src={coverSrc}
                  sexual={coverSexual}
                  alt={r.gamename}
                  className="h-full w-full"
                />
                <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg shadow-card">
                  {i + 1}
                </span>
              </Link>
              <div className="min-w-0 flex-1 text-[11px]">
                <Link
                  href={href}
                  {...linkProps}
                  className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent"
                >
                  {r.gamename}
                </Link>
                {r.furigana && r.furigana !== r.gamename && (
                  <p className="line-clamp-1 text-[10px] text-muted">{r.furigana}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                  {r.median != null && (
                    <span className="inline-flex items-center gap-0.5 text-accent">
                      <Star className="h-3 w-3 fill-accent" aria-hidden /> {(r.median / 100).toFixed(2)}
                    </span>
                  )}
                  {r.count != null && (
                    <span className="opacity-70">
                      {t.topRanked.voteCount.replace('{n}', r.count.toLocaleString())}
                    </span>
                  )}
                  {r.sellday && <span className="tabular-nums">{r.sellday.slice(0, 4)}</span>}
                </div>
                {r.brand_name && (
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{r.brand_name}</p>
                )}
                <a
                  href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${r.egs_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
                  aria-label={t.egs.openOnEgs}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden /> EGS
                </a>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
