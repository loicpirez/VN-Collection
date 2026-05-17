import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Lightbulb, Sparkles, Star } from 'lucide-react';
import { recommendVns } from '@/lib/recommend';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { SeedTagControls } from '@/components/SeedTagControls';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.recommend };
}

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ero?: string; tags?: string }>;
}) {
  const { ero, tags: rawTags } = await searchParams;
  const includeEro = ero === '1';
  const t = await getDict();

  // ?tags=g123,g456 pins the seed list; bypasses the auto-derivation.
  // Bad entries (anything that doesn't match `g\d+`) are silently
  // dropped so a tampered URL can't blow up the recommender.
  const customTagIds = (rawTags ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^g\d+$/i.test(s))
    .map((s) => s.toLowerCase());
  const usingCustomSeeds = customTagIds.length > 0;

  let seeds: Awaited<ReturnType<typeof recommendVns>>['seeds'] = [];
  let results: Awaited<ReturnType<typeof recommendVns>>['results'] = [];
  let error: string | null = null;
  try {
    const r = await recommendVns({
      includeEro,
      customTagIds: usingCustomSeeds ? customTagIds : undefined,
    });
    seeds = r.seeds;
    results = r.results;
  } catch (e) {
    error = (e as Error).message;
  }

  // Surface the user's top-rated VNs so the "Why these recommendations?"
  // explanation can name actual VNs ("because you liked X, Y") instead
  // of hiding behind raw tag-weight numbers. Same query the recommender
  // uses internally, capped at 3 for the UI.
  const topRated = db
    .prepare(`
      SELECT v.id, v.title
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.user_rating IS NOT NULL AND c.user_rating >= 70
      ORDER BY c.user_rating DESC, c.updated_at DESC
      LIMIT 3
    `)
    .all() as Array<{ id: string; title: string }>;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" aria-hidden /> {t.recommend.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.recommend.subtitle}</p>

        {seeds.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-bg-elev/30 p-3">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden />
              {t.recommend.whyTitle}
            </h2>
            <p className="text-[12px] text-muted">
              {topRated.length > 0 ? (
                <>
                  {t.recommend.whyBasedOn}{' '}
                  {topRated.map((v, i, arr) => (
                    <span key={v.id}>
                      <Link href={`/vn/${v.id}`} className="font-semibold text-white hover:text-accent">
                        {v.title}
                      </Link>
                      {i < arr.length - 1 ? (i === arr.length - 2 ? ` ${t.recommend.whyAnd} ` : ', ') : ''}
                    </span>
                  ))}
                  {'. '}
                </>
              ) : (
                <>{t.recommend.whyTagsOnly} </>
              )}
              {t.recommend.whyTags}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {seeds.map((s) => (
                <Link
                  key={s.tagId}
                  href={`/?tag=${encodeURIComponent(s.tagId)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                  title={t.recommend.tagBrowseHint}
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <Link
            href={includeEro ? '/recommendations' : '/recommendations?ero=1'}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors ${
              includeEro
                ? 'border-status-dropped/60 bg-status-dropped/10 text-status-dropped hover:bg-status-dropped/20'
                : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-white'
            }`}
            aria-pressed={includeEro}
            title={includeEro ? t.recommend.eroIncludedHint : t.recommend.eroExcludedHint}
          >
            {includeEro ? (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            )}
            {includeEro ? t.recommend.eroIncluded : t.recommend.eroExcluded}
          </Link>
          <CardDensitySlider />
        </div>
        <div className="mt-3">
          <SeedTagControls
            initial={seeds.map((s) => ({ id: s.tagId, name: s.name, weight: s.weight }))}
            paramName="tags"
            preserveParams={['ero']}
            label={t.recommend.seedsLabel}
            hint={
              usingCustomSeeds
                ? t.recommend.seedsHintCustom
                : t.recommend.seedsHint
            }
          />
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
        <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}>
          {results.map((r) => {
            const year = r.released?.slice(0, 4);
            const rating = r.rating != null ? (r.rating / 10).toFixed(1) : null;
            // Dedup matched tags before slicing so two seeds that both
            // matched the same tag don't duplicate the chip.
            const seenTagIds = new Set<string>();
            const uniqueMatched = r.matchedTags.filter((mt) => {
              if (seenTagIds.has(mt.id)) return false;
              seenTagIds.add(mt.id);
              return true;
            });
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
                    {rating && (
                      <div className="absolute right-1 top-1 rounded bg-bg-card/90 px-1.5 py-0.5 text-[10px] font-bold text-accent shadow-card backdrop-blur">
                        <Star className="mr-0.5 inline h-2.5 w-2.5 fill-accent" aria-hidden /> {rating}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-bold transition-colors group-hover:text-accent">
                      {r.title}
                    </h3>
                    {r.developers[0]?.name && (
                      <p className="line-clamp-1 text-[11px] text-muted">{r.developers[0].name}</p>
                    )}
                    {year && <p className="mt-0.5 text-[10px] text-muted">{year}</p>}
                    {uniqueMatched.length > 0 && (
                      <div className="mt-1.5">
                        <p className="text-[9px] uppercase tracking-wider text-muted/80">
                          {t.recommend.whyCardLabel}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {uniqueMatched.slice(0, 4).map((mt) => (
                            <span
                              key={mt.id}
                              className="rounded bg-bg-elev/60 px-1 py-0.5 text-[9px] text-muted"
                            >
                              {mt.name}
                            </span>
                          ))}
                          {uniqueMatched.length > 4 && (
                            <span className="text-[9px] text-muted opacity-60">
                              +{uniqueMatched.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
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
