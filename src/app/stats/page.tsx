import Link from 'next/link';
import { BarChart3, Database, Globe, KeyRound, Languages, MapPin, Package, Sparkles, Star, Tags as TagsIcon, User as UserIcon } from 'lucide-react';
import { db, getAggregateStats, getStats } from '@/lib/db';
import { getAuthInfo, getGlobalStats, type VndbStatsGlobal } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { CachePanel } from '@/components/CachePanel';
import { HBarChart, VBarChart, DonutChart } from '@/components/charts/BarChart';
import { ImportPanel } from '@/components/ImportPanel';
import { ReadingGoalCard } from '@/components/ReadingGoalCard';
import { StatsExtras } from '@/components/StatsExtras';

export const dynamic = 'force-dynamic';

interface MyStats {
  total: number;
  playtime_minutes: number;
  byStatus: { status: string; n: number }[];
  favorites: number;
  avg_user_rating: number | null;
}

function getMyStats(): MyStats {
  const base = getStats();
  const fav = (db.prepare('SELECT COUNT(*) AS n FROM collection WHERE favorite = 1').get() as { n: number }).n;
  const avg = (db
    .prepare('SELECT AVG(user_rating) AS m FROM collection WHERE user_rating IS NOT NULL')
    .get() as { m: number | null }).m;
  return {
    total: base.total,
    playtime_minutes: base.playtime_minutes,
    byStatus: base.byStatus,
    favorites: fav,
    avg_user_rating: avg,
  };
}

const STATUS_COLORS: Record<string, string> = {
  planning: '#475569',
  playing: '#3b82f6',
  completed: '#22c55e',
  on_hold: '#f59e0b',
  dropped: '#ef4444',
};

export default async function StatsPage() {
  const t = await getDict();
  const my = getMyStats();
  const agg = getAggregateStats();
  let global: VndbStatsGlobal | null = null;
  let globalError: string | null = null;
  try {
    global = await getGlobalStats();
  } catch (e) {
    globalError = (e as Error).message;
  }
  const auth = await getAuthInfo();

  const myH = Math.round(my.playtime_minutes / 60);
  const myAvg = my.avg_user_rating != null ? (my.avg_user_rating / 10).toFixed(1) : '—';

  const statusDonut = my.byStatus.map((s) => ({
    label: t.status[s.status as keyof typeof t.status] ?? s.status,
    value: s.n,
    color: STATUS_COLORS[s.status] ?? '#64748b',
  }));

  // Last 12 months for the playtime/finished chart
  const months = lastNMonths(12);
  const finishedMap = new Map(agg.finishedByMonth.map((d) => [d.month, d]));
  const finishedSeries = months.map((m) => {
    const found = finishedMap.get(m);
    return { label: m.slice(5), value: found?.count ?? 0 };
  });

  // Year released grouped by 5-year buckets for compactness, when there are many years
  const yearsBuckets = bucketYears(agg.byYear);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-accent" aria-hidden />
        <h1 className="text-2xl font-bold">{t.stats.pageTitle}</h1>
      </header>

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Star className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-bold">{t.stats.myTitle}</h2>
        </div>
        <p className="mb-4 text-xs text-muted">{t.stats.mySubtitle}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t.stats.total} value={my.total} />
          <Stat label={t.stats.playtimeHours} value={`${myH}h`} />
          <Stat label={t.stats.avgRating} value={myAvg} />
          <Stat label={t.stats.favorites} value={my.favorites} />
        </div>

        {statusDonut.length > 0 && (
          <div className="mt-6">
            <DonutChart data={statusDonut} />
          </div>
        )}
      </section>

      <ReadingGoalCard year={new Date().getFullYear()} />

      <StatsExtras />

      {agg.egs.matched + agg.egs.unmatched > 0 && (
        <section className="rounded-2xl border border-border bg-bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="text-lg font-bold">{t.stats.egsTitle}</h2>
          </div>
          <p className="mb-4 text-xs text-muted">{t.stats.egsSubtitle}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t.stats.egsMatched} value={`${agg.egs.matched} / ${agg.egs.matched + agg.egs.unmatched}`} />
            <Stat
              label={t.stats.egsAvgMedian}
              value={agg.egs.avg_median != null ? `${agg.egs.avg_median.toFixed(1)} / 100` : '—'}
            />
            <Stat
              label={t.stats.egsSumPlaytime}
              value={`${Math.round(agg.egs.sum_playtime_minutes / 60)}h`}
            />
            <Stat
              label={t.stats.egsTotalPlaytime}
              value={`${Math.round((my.playtime_minutes + agg.egs.sum_playtime_minutes) / 60)}h`}
            />
          </div>
        </section>
      )}

      {finishedSeries.some((d) => d.value > 0) && (
        <Card title={t.charts.finishedByMonth} icon={<BarChart3 className="h-5 w-5 text-accent" />}>
          <VBarChart data={finishedSeries} height={120} />
        </Card>
      )}

      {agg.ratingDistribution.some((d) => d.count > 0) && (
        <Card title={t.charts.ratingDistribution} icon={<Star className="h-5 w-5 text-accent" />}>
          <VBarChart
            data={agg.ratingDistribution.map((d) => ({ label: `${d.bucket}`, value: d.count }))}
            height={120}
          />
          <p className="mt-2 text-[11px] text-muted">{t.charts.ratingHint}</p>
        </Card>
      )}

      {agg.topTags.length > 0 && (
        <Card title={t.charts.topTags} icon={<TagsIcon className="h-5 w-5 text-accent" />}>
          <HBarChart
            data={agg.topTags.map((tag) => ({ label: tag.name, value: tag.count }))}
            barClassName="bg-accent"
          />
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {agg.byLanguage.length > 0 && (
          <Card title={t.charts.byLanguage} icon={<Languages className="h-5 w-5 text-accent" />}>
            <HBarChart data={agg.byLanguage.map((d) => ({ label: d.lang.toUpperCase(), value: d.count }))} />
          </Card>
        )}

        {agg.byPlatform.length > 0 && (
          <Card title={t.charts.byPlatform} icon={<Globe className="h-5 w-5 text-accent" />}>
            <HBarChart data={agg.byPlatform.map((d) => ({ label: d.platform.toUpperCase(), value: d.count }))} />
          </Card>
        )}

        {agg.byLocation.some((d) => d.location !== 'unknown') && (
          <Card title={t.charts.byLocation} icon={<MapPin className="h-5 w-5 text-accent" />}>
            <HBarChart
              data={agg.byLocation.map((d) => ({
                label: t.locations[d.location as keyof typeof t.locations] ?? d.location,
                value: d.count,
              }))}
            />
          </Card>
        )}

        {agg.byEdition.some((d) => d.edition !== 'none') && (
          <Card title={t.charts.byEdition} icon={<Package className="h-5 w-5 text-accent" />}>
            <HBarChart
              data={agg.byEdition.map((d) => ({
                label: t.editions[d.edition as keyof typeof t.editions] ?? d.edition,
                value: d.count,
              }))}
            />
          </Card>
        )}
      </div>

      {yearsBuckets.length > 0 && (
        <Card title={t.charts.byYear} icon={<BarChart3 className="h-5 w-5 text-accent" />}>
          <VBarChart
            data={yearsBuckets.map((d) => {
              const range = d.label.split('-');
              const yMin = range[0];
              const yMax = range[1] ?? range[0];
              return {
                label: d.label,
                value: d.count,
                href: `/?yearMin=${yMin}&yearMax=${yMax}`,
                tooltip: `${d.label}: ${d.count}`,
              };
            })}
            height={140}
            barClassName="bg-accent"
          />
          <p className="mt-2 text-[11px] text-muted">{t.charts.yearChartHint}</p>
        </Card>
      )}

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-bold">{t.stats.vndbTitle}</h2>
        </div>
        <p className="mb-4 text-xs text-muted">{t.stats.vndbSubtitle}</p>
        {globalError && <p className="mb-3 text-sm text-status-dropped">{globalError}</p>}
        {global && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
            <Stat label={t.stats.vn} value={global.vn} />
            <Stat label={t.stats.releases} value={global.releases} />
            <Stat label={t.stats.chars} value={global.chars} />
            <Stat label={t.stats.producers} value={global.producers} />
            <Stat label={t.stats.staff} value={global.staff} />
            <Stat label={t.stats.tagsCount} value={global.tags} />
            <Stat label={t.stats.traitsCount} value={global.traits} />
          </div>
        )}
      </section>

      <CachePanel />

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-lg font-bold">{t.stats.authTitle}</h2>
        </div>
        {auth ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <UserIcon className="h-4 w-4 text-muted" />
            <span className="text-muted">{t.stats.authedAs}</span>
            <a
              href={`https://vndb.org/${auth.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-accent hover:underline"
            >
              {auth.username}
            </a>
            {auth.permissions.length > 0 && (
              <span className="text-xs text-muted">
                · {t.stats.permissions}: {auth.permissions.join(', ')}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t.stats.anonymous}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <h2 className="mb-3 text-lg font-bold">{t.dataMgmt.title}</h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/collection/export" className="btn" download>
            ⬇ {t.dataMgmt.exportJson}
          </Link>
          <Link href="/api/backup" className="btn" download>
            ⬇ {t.dataMgmt.backupDb}
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-muted">{t.dataMgmt.importHint}</p>
        <ImportPanel />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  const formatted = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <div className="rounded-lg border border-border bg-bg-elev/50 p-4 text-center">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{formatted}</div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function lastNMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    out.push(`${yyyy}-${mm}`);
  }
  return out;
}

function bucketYears(rows: { year: string; count: number }[]): { label: string; count: number }[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.year.localeCompare(b.year));
  // If small range, show every year. Else 5-year buckets.
  const minY = Number(sorted[0].year);
  const maxY = Number(sorted[sorted.length - 1].year);
  if (Number.isNaN(minY) || Number.isNaN(maxY)) return rows.map((r) => ({ label: r.year, count: r.count }));
  if (maxY - minY <= 12) {
    return sorted.map((r) => ({ label: r.year, count: r.count }));
  }
  const buckets = new Map<string, number>();
  for (const r of sorted) {
    const y = Number(r.year);
    if (Number.isNaN(y)) continue;
    const start = Math.floor(y / 5) * 5;
    const key = `${start}-${start + 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + r.count);
  }
  return Array.from(buckets.entries()).map(([label, count]) => ({ label, count }));
}
