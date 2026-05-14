import Link from 'next/link';
import { ArrowLeft, Sparkles, Star } from 'lucide-react';
import { recommendVns } from '@/lib/recommend';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ero?: string }>;
}) {
  const { ero } = await searchParams;
  const includeEro = ero === '1';
  const t = await getDict();

  let seeds: Awaited<ReturnType<typeof recommendVns>>['seeds'] = [];
  let results: Awaited<ReturnType<typeof recommendVns>>['results'] = [];
  let error: string | null = null;
  try {
    const r = await recommendVns({ includeEro });
    seeds = r.seeds;
    results = r.results;
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" /> {t.recommend.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.recommend.subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <Link
            href={includeEro ? '/recommendations' : '/recommendations?ero=1'}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 hover:border-accent hover:text-accent"
          >
            {includeEro ? t.recommend.hideEro : t.recommend.includeEro}
          </Link>
          {seeds.length > 0 && (
            <span className="text-muted">
              {t.recommend.seeded}:{' '}
              {seeds.map((s) => (
                <Link
                  key={s.tagId}
                  href={`/?tag=${encodeURIComponent(s.tagId)}`}
                  className="mx-0.5 inline-block rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-white/80 hover:text-accent"
                >
                  {s.name} · {s.weight.toFixed(1)}
                </Link>
              ))}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {seeds.length === 0 && !error && (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.recommend.empty}
        </p>
      )}

      {results.length > 0 && (
        <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {results.map((r) => {
            const year = r.released?.slice(0, 4);
            const rating = r.rating != null ? (r.rating / 10).toFixed(1) : null;
            return (
              <li key={r.id}>
                <Link
                  href={`/vn/${r.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-bg-card p-3 transition-colors hover:border-accent"
                >
                  <div className="relative">
                    <SafeImage
                      src={r.image?.thumbnail || r.image?.url || null}
                      sexual={r.image?.sexual ?? null}
                      alt={r.title}
                      className="aspect-[2/3] w-full rounded-lg"
                    />
                    <div className="absolute right-1 top-1 rounded bg-bg-card/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent shadow-card backdrop-blur">
                      {r.score.toFixed(1)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-bold transition-colors group-hover:text-accent">
                      {r.title}
                    </h3>
                    {r.developers[0]?.name && (
                      <p className="line-clamp-1 text-[11px] text-muted">{r.developers[0].name}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted">
                      {rating && (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <Star className="h-3 w-3 fill-accent" /> {rating}
                        </span>
                      )}
                      {year && <span>{year}</span>}
                    </div>
                    {r.matchedTags.length > 0 && (
                      <p className="mt-1 line-clamp-2 text-[10px] text-muted">
                        {r.matchedTags.slice(0, 4).map((t) => t.name).join(' · ')}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
