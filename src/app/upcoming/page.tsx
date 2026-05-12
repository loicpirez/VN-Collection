import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarRange, ExternalLink, Flame, Globe, Library as LibraryIcon } from 'lucide-react';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection, type UpcomingRelease } from '@/lib/upcoming';
import { fetchEgsAnticipated, type EgsAnticipated } from '@/lib/erogamescape';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { SkeletonCardGrid, SkeletonRows } from '@/components/Skeleton';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <CalendarRange className="h-6 w-6 text-accent" /> {t.upcoming.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.upcoming.subtitle}</p>
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
      return <AnticipatedSection rows={rows} t={t} />;
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

function ReleasesSection({
  rows,
  empty,
}: {
  rows: UpcomingRelease[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">{empty}</p>
    );
  }
  const grouped = groupByMonth(rows);
  return (
    <>
      {Array.from(grouped.entries()).map(([month, rels]) => (
        <section key={month} className="mb-6 rounded-xl border border-border bg-bg-card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {month} · <span className="opacity-70">{rels.length}</span>
          </h2>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {rels.map((r) => (
              <li key={r.id}>
                <div className="flex gap-3 rounded-lg border border-border bg-bg-elev/30 p-3">
                  {r.vns[0] && (
                    <Link href={`/vn/${r.vns[0].id}`} className="block h-24 w-16 shrink-0 overflow-hidden rounded">
                      <SafeImage
                        src={r.vns[0].image?.thumbnail || r.vns[0].image?.url || null}
                        sexual={r.vns[0].image?.sexual ?? null}
                        alt={r.title}
                        className="h-full w-full"
                      />
                    </Link>
                  )}
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
  t,
}: {
  rows: EgsAnticipated[];
  t: Dictionary;
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">{t.upcoming.emptyAnticipated}</p>;
  }
  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-5">
      <p className="mb-4 text-[11px] text-muted">{t.upcoming.anticipatedSubtitle}</p>
      <ol className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {rows.map((a, i) => (
          <li key={a.egs_id} className="flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-3">
            <div className="relative shrink-0">
              <Link
                href={a.vndb_id ? `/vn/${a.vndb_id}` : `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${a.egs_id}`}
                target={a.vndb_id ? undefined : '_blank'}
                rel={a.vndb_id ? undefined : 'noopener noreferrer'}
                className="block h-24 w-16 overflow-hidden rounded"
              >
                <SafeImage src={`/api/egs-cover/${a.egs_id}`} alt={a.gamename} className="h-full w-full" />
              </Link>
              <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg shadow">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                {a.vndb_id ? (
                  <Link href={`/vn/${a.vndb_id}`} className="line-clamp-1 text-sm font-bold hover:text-accent">
                    {a.gamename}
                  </Link>
                ) : (
                  <span className="line-clamp-1 text-sm font-bold">{a.gamename}</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted">
                <span className="rounded bg-bg-card px-1.5 py-0.5 uppercase tracking-wider text-accent">{a.sellday}</span>
                {a.brand_name && <span>{a.brand_name}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
                  {t.upcoming.willBuy} {a.will_buy}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-accent-blue/15 px-1.5 py-0.5 font-semibold text-accent-blue">
                  {t.upcoming.probablyBuy} {a.probably_buy}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-muted/15 px-1.5 py-0.5 font-semibold text-muted">
                  {t.upcoming.watching} {a.watching}
                </span>
              </div>
              <div className="mt-1.5 flex gap-2">
                <a
                  href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${a.egs_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
                >
                  <ExternalLink className="h-3 w-3" /> EGS
                </a>
                {a.vndb_id && (
                  <a
                    href={`https://vndb.org/${a.vndb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" /> VNDB
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
