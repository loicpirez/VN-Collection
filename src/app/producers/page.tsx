import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Crown, Download, Package, Trophy, Wrench } from 'lucide-react';
import { listProducerStats, listPublisherStats } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { ProducerLogo } from '@/components/ProducerLogo';
import type { ProducerStat } from '@/lib/types';

export const dynamic = 'force-dynamic';

type RoleTab = 'developer' | 'publisher';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.producers };
}

/**
 * Two-tab ranking page. The "developer" tab counts each producer's
 * developed VNs in the collection (joined on `vn.developers`),
 * the "publisher" tab counts the same producer's PUBLISHED VNs
 * (joined on `vn.publishers`). VNDB models these as two distinct
 * roles attached to releases, so a publisher-only studio
 * (Studio X, Studio Y, Studio Z…) only ever appears under the
 * publisher tab — they never developed any of the VNs they ship.
 */
export default async function ProducersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const t = await getDict();
  const sp = await searchParams;
  const role: RoleTab = sp.role === 'publisher' ? 'publisher' : 'developer';

  const devStats = listProducerStats();
  const pubStats = listPublisherStats();
  const producers = role === 'publisher' ? pubStats : devStats;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Trophy className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.producers.pageTitle}</h1>
          <p className="text-sm text-muted">
            {role === 'publisher' ? t.producers.rankingPublisher : t.producers.rankingDeveloper}
          </p>
        </div>
      </header>

      <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-border bg-bg-card p-1 text-sm">
        <TabLink active={role === 'developer'} href="/producers" icon={<Wrench className="h-3.5 w-3.5" />}>
          {t.producers.tabDevelopers} · <span className="font-bold tabular-nums">{devStats.length}</span>
        </TabLink>
        <TabLink
          active={role === 'publisher'}
          href="/producers?role=publisher"
          icon={<Package className="h-3.5 w-3.5" />}
        >
          {t.producers.tabPublishers} · <span className="font-bold tabular-nums">{pubStats.length}</span>
        </TabLink>
      </div>

      {producers.length === 0 ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-muted" aria-hidden />
          <p className="mb-4 text-muted">
            {role === 'publisher' ? t.producers.emptyPublisher : t.producers.emptyDeveloper}
          </p>
          {role === 'publisher' && (
            <p className="mx-auto mb-4 max-w-sm text-xs text-muted/80">
              {t.producers.emptyPublisherHint}
            </p>
          )}
          <Link href="/" className="btn">
            <Download className="h-4 w-4" />
            {t.producers.emptyCta}
          </Link>
        </div>
      ) : (
        <ProducerTable producers={producers} role={role} t={t} />
      )}
    </div>
  );
}

function TabLink({
  active,
  href,
  icon,
  children,
}: {
  active: boolean;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
        active ? 'bg-accent text-bg font-bold' : 'text-muted hover:bg-bg-elev'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function ProducerTable({
  producers,
  role,
  t,
}: {
  producers: ProducerStat[];
  role: RoleTab;
  t: Awaited<ReturnType<typeof getDict>>;
}) {
  const roleHeader = role === 'publisher' ? t.detail.publishers : t.detail.developers;
  return (
    <div className="scroll-fade-right overflow-x-auto rounded-2xl border border-border bg-bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-bg-elev/60 text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="w-12 px-3 py-3 sm:px-4">#</th>
            <th className="px-3 py-3 sm:px-4">{roleHeader}</th>
            <th className="px-3 py-3 text-right sm:px-4">{t.producers.vnCount}</th>
            <th className="px-3 py-3 text-right sm:px-4">{t.producers.avgUserRating}</th>
            <th className="px-3 py-3 text-right sm:px-4">{t.producers.avgRating}</th>
          </tr>
        </thead>
        <tbody>
          {producers.map((p, i) => {
            const displayUserAvg = p.avg_user_rating != null ? (p.avg_user_rating / 10).toFixed(1) : '—';
            const displayAvg = p.avg_rating != null ? (p.avg_rating / 10).toFixed(1) : '—';
            return (
              <tr key={p.id} className="border-t border-border hover:bg-bg-elev/30">
                <td className="px-3 py-3 align-middle sm:px-4">
                  {i === 0 ? (
                    <Crown className="h-5 w-5 text-accent" aria-hidden />
                  ) : (
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                        i < 3 ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                      }`}
                    >
                      {i + 1}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-middle sm:px-4">
                  <Link href={`/producer/${p.id}`} className="flex items-center gap-3 hover:text-accent">
                    <ProducerLogo producer={p} size={36} />
                    <div className="min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      {p.original && p.original !== p.name && (
                        <div className="text-xs text-muted">{p.original}</div>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right align-middle font-bold tabular-nums sm:px-4">{p.vn_count}</td>
                <td className="px-3 py-3 text-right align-middle text-accent tabular-nums sm:px-4">
                  {displayUserAvg}
                </td>
                <td className="px-3 py-3 text-right align-middle tabular-nums sm:px-4">{displayAvg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
