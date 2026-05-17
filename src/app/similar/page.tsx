import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Star } from 'lucide-react';
import { getCollectionItem } from '@/lib/db';
import { vndbAdvancedSearchRaw } from '@/lib/vndb-recommend';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { SeedTagControls } from '@/components/SeedTagControls';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ vn?: string }>;
}): Promise<Metadata> {
  const { vn: vnId } = await searchParams;
  const dict = await getDict();
  if (vnId) {
    const seed = getCollectionItem(vnId);
    if (seed) return { title: `${dict.similar.title}: ${seed.title}` };
  }
  return { title: dict.similar.title };
}

interface SimilarHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  votecount: number | null;
  length_minutes: number | null;
  image: { url: string; thumbnail: string; sexual?: number } | null;
  developers: { name: string }[];
  score: number;
}

export default async function SimilarPage({
  searchParams,
}: {
  searchParams: Promise<{ vn?: string; tags?: string }>;
}) {
  const { vn: seedId, tags: rawTags } = await searchParams;
  const t = await getDict();
  if (!seedId || !/^(v\d+|egs_\d+)$/i.test(seedId)) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
          <ArrowLeft className="h-4 w-4" /> {t.nav.library}
        </Link>
        <p className="rounded-xl border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm">
          {t.common.error}
        </p>
      </div>
    );
  }
  const seed = getCollectionItem(seedId);
  if (!seed) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
          <ArrowLeft className="h-4 w-4" /> {t.nav.library}
        </Link>
        <p className="rounded-xl border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm">
          {t.detail.notFoundTitle}
        </p>
      </div>
    );
  }

  // URL-pinned seed override (?tags=g123,g456). Bypasses the auto
  // top-6 derivation from the seed VN's own tag list. Bad ids are
  // silently dropped so a tampered URL doesn't blow up the page.
  const customTagIds = (rawTags ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^g\d+$/.test(s));
  const usingCustomSeeds = customTagIds.length > 0;

  const autoSeedTags = (seed.tags ?? [])
    .filter((tg) => tg.spoiler === 0 && tg.category !== 'ero')
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);

  // When custom seeds are pinned, look up their names from the seed
  // VN's tag list when possible (so chips render the real name);
  // otherwise fall back to the id itself.
  const allSeedNames = new Map<string, { id: string; name: string; rating?: number }>();
  for (const tg of seed.tags ?? []) allSeedNames.set(tg.id, { id: tg.id, name: tg.name, rating: tg.rating ?? undefined });
  const seedTags = usingCustomSeeds
    ? customTagIds.map((id) => allSeedNames.get(id) ?? { id, name: id })
    : autoSeedTags;

  // Parallelize the per-seed-tag VNDB queries. Sequential awaits
  // stacked up to 6 × VNDB RTT before the page could paint; running
  // them concurrently lets the throttle serialize them but cuts
  // perceived latency. A single tag failure (network blip) no
  // longer takes down the whole page — collected per-tag errors
  // surface as a small warning banner below.
  const hits = new Map<string, SimilarHit>();
  const tagFailures: string[] = [];
  const perTag = await Promise.all(
    seedTags.map((tag) =>
      vndbAdvancedSearchRaw({
        filters: [
          'and',
          ['tag', '=', [tag.id, 1, 1.2]],
          ['votecount', '>=', 30],
          ['id', '!=', seed.id],
        ],
        sort: 'rating',
        reverse: true,
        results: 20,
      })
        .then((results) => ({ tag, results }))
        .catch((err) => {
          tagFailures.push(tag.name || tag.id);
          console.error(`[similar] seed ${tag.id} failed:`, (err as Error).message);
          return { tag, results: [] as Awaited<ReturnType<typeof vndbAdvancedSearchRaw>> };
        }),
    ),
  );
  for (const { tag, results } of perTag) {
    for (const r of results) {
      const cur = hits.get(r.id);
      if (cur) cur.score += tag.rating ?? 1;
      else hits.set(r.id, { ...r, score: tag.rating ?? 1 });
    }
  }
  const results = Array.from(hits.values())
    .sort((a, b) => b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 24);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/vn/${seed.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {seed.title}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" /> {t.similar.title}: {seed.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.similar.subtitle}</p>
        {seedTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {seedTags.map((tag) => (
              <Link
                key={tag.id}
                href={`/?tag=${encodeURIComponent(tag.id)}`}
                className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 hover:border-accent hover:text-accent"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3">
          <SeedTagControls
            initial={seedTags.map((tag) => ({ id: tag.id, name: tag.name }))}
            paramName="tags"
            preserveParams={['vn']}
            label={t.recommend.seedsLabel}
            hint={usingCustomSeeds ? t.recommend.seedsHintCustom : t.similar.seedsAutoHint}
          />
        </div>
      </header>

      {tagFailures.length > 0 && (
        <div className="mb-4 rounded-md border border-status-on_hold/40 bg-status-on_hold/10 px-3 py-2 text-[11px] text-status-on_hold">
          {t.similar.partialFailure.replace('{tags}', tagFailures.join(', '))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardDensitySlider />
      </div>

      {results.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.similar.empty}
        </p>
      ) : (
        <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}>
          {results.map((r) => {
            const year = r.released?.slice(0, 4);
            const rating = r.rating != null ? (r.rating / 10).toFixed(1) : null;
            return (
              <li key={r.id}>
                <Link
                  href={`/vn/${r.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-bg-card p-3 transition-colors hover:border-accent"
                >
                  <SafeImage
                    src={r.image?.thumbnail || r.image?.url || null}
                    sexual={r.image?.sexual ?? null}
                    alt={r.title}
                    className="aspect-[2/3] w-full rounded-lg"
                  />
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
