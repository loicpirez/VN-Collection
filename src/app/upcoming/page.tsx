import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarRange, ExternalLink, Flame, Globe, Library as LibraryIcon } from 'lucide-react';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection, type UpcomingRelease } from '@/lib/upcoming';
import { fetchEgsAnticipated, type EgsAnticipated } from '@/lib/erogamescape';
import { fetchVnCovers, type VndbCoverInfo } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { db, getCacheFreshness } from '@/lib/db';
import { SafeImage } from '@/components/SafeImage';
import { SkeletonCardGrid, SkeletonRows } from '@/components/Skeleton';
import { RefreshPageButton } from '@/components/RefreshPageButton';
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

export default async function UpcomingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getDict();
  const { tab: rawTab } = await searchParams;
  const tab = parseTab(rawTab);
  const lastUpdatedAt = getCacheFreshness(['% /release|%', '% /release:%', 'anticipated:%']);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
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
          <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
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

      <Suspense key={tab} fallback={<UpcomingTabSkeleton tab={tab} />}>
        <TabContent tab={tab} t={t} />
      </Suspense>
    </div>
  );
}

async function TabContent({ tab, t }: { tab: Tab; t: Dictionary }) {
  try {
    if (tab === 'anticipated') {
      const rows = await fetchEgsAnticipated(100);
      // Most anticipated entries already carry a VNDB id (the card title
      // links there). Batch-fetch their cover URLs in a single VNDB call
      // so we can show the high-quality VNDB poster directly instead of
      // bouncing through the EGS resolver / shop CDNs.
      const vndbIds = rows.map((r) => r.vndb_id).filter((v): v is string => !!v);
      const vndbCovers = await fetchVnCovers(vndbIds);
      return <AnticipatedSection rows={rows} vndbCovers={vndbCovers} t={t} />;
    }
    if (tab === 'all') {
      const rows = await fetchAllUpcomingFromVndb(200);
      return <ReleasesSection rows={rows} empty={t.upcoming.emptyAll} />;
    }
    const rows = await fetchUpcomingForCollection();
    return <ReleasesSection rows={rows} empty={t.upcoming.empty} />;
  } catch (e) {
    return (
      <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
        {(e as Error).message}
      </div>
    );
  }
}

function UpcomingTabSkeleton({ tab }: { tab: Tab }) {
  if (tab === 'anticipated') return <SkeletonCardGrid count={12} />;
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
 * user's collection we have richer data locally — including a mirrored
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

function ReleasesSection({
  rows,
  empty,
}: {
  rows: UpcomingRelease[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">{empty}</p>
    );
  }
  const localCovers = loadLocalCovers(rows);
  const grouped = groupByMonth(rows);
  return (
    <>
      {Array.from(grouped.entries()).map(([month, rels]) => (
        <section key={month} className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {month} · <span className="opacity-70">{rels.length}</span>
          </h2>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {rels.map((r) => (
              <li key={r.id}>
                <div className="flex gap-3 rounded-lg border border-border bg-bg-elev/30 p-3">
                  {r.vns[0] && (() => {
                    const v = r.vns[0];
                    const local = localCovers.get(v.id);
                    const remoteFromRel = v.image?.url || v.image?.thumbnail || null;
                    const finalRemote = remoteFromRel || local?.url || local?.thumb || null;
                    const finalLocal = local?.local || local?.local_thumb || null;
                    const finalSexual = v.image?.sexual ?? local?.sexual ?? null;
                    return (
                      <Link href={`/vn/${v.id}`} className="block h-24 w-16 shrink-0 overflow-hidden rounded">
                        <SafeImage
                          src={finalRemote}
                          localSrc={finalLocal}
                          sexual={finalSexual}
                          alt={r.title}
                          className="h-full w-full"
                        />
                      </Link>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold">{r.title}</span>
                      <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                        {r.released}
                      </span>
                    </div>
                    {r.alttitle && r.alttitle !== r.title && (
                      <div className="text-[11px] text-muted">{r.alttitle}</div>
                    )}
                    <div className="mt-1 text-[11px] text-muted">
                      {r.producers.filter((p) => p.id).slice(0, 3).map((p, i, arr) => (
                        <Link key={p.id} href={`/producer/${p.id}`} className="hover:text-accent">
                          {p.name}{i < arr.length - 1 ? ' · ' : ''}
                        </Link>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                      {r.patch && <span className="rounded bg-status-on_hold/15 px-1.5 py-0.5 text-status-on_hold">PATCH</span>}
                      {r.freeware && <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-accent-blue">FREEWARE</span>}
                      {r.has_ero && <span className="rounded bg-status-dropped/15 px-1.5 py-0.5 text-status-dropped">18+</span>}
                    </div>
                    <a
                      href={`https://vndb.org/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
                    >
                      <ExternalLink className="h-3 w-3" /> VNDB
                    </a>
                  </div>
                </div>
              </li>
            ))}
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
}: {
  rows: EgsAnticipated[];
  vndbCovers: Map<string, VndbCoverInfo>;
  t: Dictionary;
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">{t.upcoming.emptyAnticipated}</p>;
  }
  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 sm:p-5">
      <p className="mb-4 text-[11px] text-muted">{t.upcoming.anticipatedSubtitle}</p>
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
        {rows.map((a, i) => {
          // Prefer the VNDB cover when the anticipated row carries a
          // vndb_id and VNDB returned an image for it. Falls back to the
          // EGS resolver chain only when there's no VNDB mapping.
          const vndbCover = a.vndb_id ? vndbCovers.get(a.vndb_id) ?? null : null;
          const coverSrc = vndbCover?.url ?? `/api/egs-cover/${a.egs_id}`;
          const coverSexual = vndbCover?.sexual ?? null;
          const coverHref = a.vndb_id
            ? `/vn/${a.vndb_id}`
            : `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${a.egs_id}`;
          return (
            <li
              key={a.egs_id}
              className="group flex gap-4 rounded-xl border border-border bg-bg-elev/40 p-3 transition-colors hover:border-accent sm:p-4"
            >
              <div className="relative shrink-0">
                <Link
                  href={coverHref}
                  target={a.vndb_id ? undefined : '_blank'}
                  rel={a.vndb_id ? undefined : 'noopener noreferrer'}
                  className="block h-48 w-32 overflow-hidden rounded-lg shadow-card sm:h-56 sm:w-36"
                >
                  <SafeImage src={coverSrc} alt={a.gamename} sexual={coverSexual} className="h-full w-full" />
                </Link>
                <span className="absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg shadow-card">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                  {a.vndb_id ? (
                    <Link href={`/vn/${a.vndb_id}`} className="line-clamp-2 text-base font-bold hover:text-accent">
                      {a.gamename}
                    </Link>
                  ) : (
                    <span className="line-clamp-2 text-base font-bold">{a.gamename}</span>
                  )}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                  <span className="rounded bg-bg-card px-2 py-0.5 font-mono uppercase tracking-wider text-accent">{a.sellday}</span>
                  {a.brand_name && <span className="line-clamp-1">{a.brand_name}</span>}
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
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
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <a
                    href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${a.egs_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" /> EGS
                  </a>
                  {a.vndb_id && (
                    <a
                      href={`https://vndb.org/${a.vndb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted hover:text-accent"
                    >
                      <ExternalLink className="h-3 w-3" /> VNDB
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
