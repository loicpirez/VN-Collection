import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Star, Tag as TagIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { tagPageEmptyState } from '@/lib/tag-page-empty-state';
import { parseTagPageParams, tagPageTabHref } from '@/lib/tags-page-modes';
import { getTag, fetchTopVnsByTag } from '@/lib/vndb';
import { SafeImage } from '@/components/SafeImage';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { VndbMarkup } from '@/components/VndbMarkup';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const dict = await getDict();
  const tagInfo = await getTag(id.toLowerCase()).catch(() => null);
  const baseTitle = tagInfo?.name ?? id;
  return { title: `${baseTitle} — ${dict.nav.tags}` };
}

/**
 * `/tag/[id]` — rich tag landing page.
 *
 * - Header surfaces the VNDB-side tag metadata (name, category,
 *   description, aliases, vn_count).
 * - Tab strip Local / VNDB:
 *   - Local: count of the operator's collection VNs carrying the tag,
 *     plus the deep-link to `/?tag=<id>` that does the actual filter.
 *   - VNDB: top-rated VNs with this tag pulled via
 *     `advancedSearchVn({ filters: [tag, '=', [id, 1, 1.2]] }`,
 *     cached via `cachedFetch` in `lib/vndb.ts`.
 *
 * Tag id format is `g\d+`; anything else 404s. Falls back to the
 * "Explorer sur VNDB" empty-state CTA from Blocker 10 when the
 * Library returns zero — never a dead end.
 */
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TagPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!/^g\d+$/i.test(id)) notFound();
  const sp = await searchParams;
  const t = await getDict();
  const tagId = id.toLowerCase();
  const { tab } = parseTagPageParams(sp);

  // Count how many local-collection VNs carry this tag. Same JSON
  // walk pattern as `listCollectionTags` in lib/db.ts.
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
       WHERE json_extract(je.value, '$.id') = ?`,
    )
    .get(tagId) as { n: number };
  const count = row?.n ?? 0;
  const state = tagPageEmptyState({ tagId, collectionCount: count });

  // Best-effort fetch of the VNDB-side metadata for the header. If the
  // operator is offline the page still renders with just the id.
  const tagInfo = await getTag(tagId).catch(() => null);

  // Top VNs by VNDB rating for the tag — only fetched when the VNDB
  // tab is active to keep the local-tab path on the SQLite-only fast
  // path. Filter syntax: `['tag', '=', [id, lie, spoiler]]` where
  // `1.2` keeps a soft "the VN really has this tag" threshold.
  let topVndb: Array<{
    id: string;
    title: string;
    image: { url: string; thumbnail: string } | null;
    rating: number | null;
    released: string | null;
  }> = [];
  let vndbError: string | null = null;
  if (tab === 'vndb') {
    try {
      const r = await fetchTopVnsByTag(tagId, { results: 24 });
      topVndb = r.results.map((v) => ({
        id: v.id,
        title: v.title,
        image: v.image ?? null,
        rating: v.rating,
        released: v.released,
      }));
    } catch (e) {
      vndbError = (e as Error).message;
    }
  }

  return (
    <DensityScopeProvider scope="tagPage" className="mx-auto max-w-5xl">
      <Link href="/tags" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.tags}
      </Link>

      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <TagIcon className="h-6 w-6 text-accent" aria-hidden /> {tagInfo?.name ?? tagId}
        </h1>
        {tagInfo?.category && (
          <div className="mt-1 text-[11px] uppercase tracking-wider text-accent">
            {t.tags[`cat_${tagInfo.category}` as 'cat_cont' | 'cat_ero' | 'cat_tech']}
          </div>
        )}
        {tagInfo?.aliases && tagInfo.aliases.length > 0 && (
          <div className="mt-2 text-xs text-muted">{tagInfo.aliases.join(' · ')}</div>
        )}
        {tagInfo?.description && (
          <div className="mt-3 text-xs text-white/80">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">{t.tagPage.description}</div>
            <VndbMarkup text={tagInfo.description} />
          </div>
        )}
        <p className="mt-3 text-sm text-muted">
          {state.isEmpty ? t.tagPage.emptyHint : t.tagPage.countHint.replace('{n}', String(count))}
        </p>

        <nav
          className="mt-4 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
          role="tablist"
        >
          <Link
            href={tagPageTabHref(tagId, 'local')}
            role="tab"
            aria-selected={tab === 'local'}
            className={`rounded px-2.5 py-1 ${tab === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.tagPage.tabLocal} ({count})
          </Link>
          <Link
            href={tagPageTabHref(tagId, 'vndb')}
            role="tab"
            aria-selected={tab === 'vndb'}
            className={`rounded px-2.5 py-1 ${tab === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.tagPage.tabVndb}
          </Link>
        </nav>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {state.isEmpty ? (
            <a
              href={state.vndbExternal}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t.tagPage.exploreOnVndb}
            </a>
          ) : (
            <Link href={state.fallbackLibrary} className="btn btn-primary">
              {t.tagPage.openLibrary}
            </Link>
          )}
          {!state.isEmpty && (
            <a
              href={state.vndbExternal}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> VNDB
            </a>
          )}
          <CardDensitySlider scope="tagPage" />
        </div>
      </header>

      {tab === 'vndb' && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {t.tagPage.topVns}
          </h2>
          {vndbError && (
            <p className="text-sm text-status-dropped">{vndbError}</p>
          )}
          {!vndbError && topVndb.length === 0 && (
            <p className="text-sm text-muted">{t.search.noResults}</p>
          )}
          {topVndb.length > 0 && (
            <ul
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 180px)), 1fr))' }}
            >
              {topVndb.map((v) => {
                const year = v.released?.slice(0, 4);
                const ratingDisplay = v.rating != null ? (v.rating / 10).toFixed(1) : null;
                return (
                  <li key={v.id}>
                    <Link
                      href={`/vn/${v.id}`}
                      className="group flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                    >
                      <div className="aspect-[2/3] w-full overflow-hidden rounded">
                        <SafeImage
                          src={v.image?.thumbnail || v.image?.url || null}
                          alt={v.title}
                          className="h-full w-full"
                        />
                      </div>
                      <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                        {v.title}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        {ratingDisplay && (
                          <span className="inline-flex items-center gap-0.5 text-accent">
                            <Star className="h-3 w-3 fill-accent" aria-hidden /> {ratingDisplay}
                          </span>
                        )}
                        {year && (
                          <Link
                            href={`/?yearMin=${year}&yearMax=${year}`}
                            className="hover:text-accent"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {year}
                          </Link>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </DensityScopeProvider>
  );
}
