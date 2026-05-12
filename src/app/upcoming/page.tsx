import Link from 'next/link';
import { ArrowLeft, CalendarRange, ExternalLink } from 'lucide-react';
import { fetchUpcomingForCollection, type UpcomingRelease } from '@/lib/upcoming';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

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

export default async function UpcomingPage() {
  const t = await getDict();
  let releases: UpcomingRelease[] = [];
  let error: string | null = null;
  try {
    releases = await fetchUpcomingForCollection();
  } catch (e) {
    error = (e as Error).message;
  }
  const grouped = groupByMonth(releases);

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
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {!error && releases.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          {t.upcoming.empty}
        </p>
      )}

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
    </div>
  );
}
