import Link from 'next/link';
import { Building2, Crown, Trophy } from 'lucide-react';
import { listProducerStats } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { ProducerLogo } from '@/components/ProducerLogo';

export const dynamic = 'force-dynamic';

export default async function ProducersPage() {
  const t = await getDict();
  const producers = listProducerStats();

  if (producers.length === 0) {
    return (
      <div className="py-20 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-muted" aria-hidden />
        <h1 className="mb-2 text-2xl font-bold">{t.producers.pageTitle}</h1>
        <p className="text-muted">{t.producers.empty}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Trophy className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.producers.pageTitle}</h1>
          <p className="text-sm text-muted">{t.producers.ranking}</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-bg-card">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev/60 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">{t.detail.developers}</th>
              <th className="px-4 py-3 text-right">{t.producers.vnCount}</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">{t.producers.avgUserRating}</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">{t.producers.avgRating}</th>
            </tr>
          </thead>
          <tbody>
            {producers.map((p, i) => {
              const displayUserAvg = p.avg_user_rating != null ? (p.avg_user_rating / 10).toFixed(1) : '—';
              const displayAvg = p.avg_rating != null ? (p.avg_rating / 10).toFixed(1) : '—';
              return (
                <tr key={p.id} className="border-t border-border hover:bg-bg-elev/30">
                  <td className="px-4 py-3 align-middle">
                    {i === 0 ? (
                      <Crown className="h-5 w-5 text-accent" aria-hidden />
                    ) : (
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                        i < 3 ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'
                      }`}>{i + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
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
                  <td className="px-4 py-3 text-right align-middle font-bold tabular-nums">{p.vn_count}</td>
                  <td className="hidden px-4 py-3 text-right align-middle text-accent tabular-nums md:table-cell">{displayUserAvg}</td>
                  <td className="hidden px-4 py-3 text-right align-middle tabular-nums md:table-cell">{displayAvg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
