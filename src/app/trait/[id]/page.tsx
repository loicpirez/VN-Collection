import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CornerDownRight, ExternalLink, Sparkles } from 'lucide-react';
import { getCharactersForTraitInVns, getCharactersForTraitPage, getTrait, type VndbCharacter, type VndbTrait } from '@/lib/vndb';
import { getPeopleRepository } from '@/lib/db/repositories/people';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getDict, getLocale } from '@/lib/i18n/server';
import { fmtNum } from '@/lib/locale-number';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getDict();
  try {
    const trait = await getTrait(id);
    if (trait?.name) return { title: trait.name };
  } catch {
    // fall through
  }
  return { title: t.nav.traits };
}
import { StatusBadge } from '@/components/StatusBadge';
import { SafeImage } from '@/components/SafeImage';
import { VndbMarkup } from '@/components/VndbMarkup';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';

export const dynamic = 'force-dynamic';

const TRAIT_CHARACTER_PAGE_SIZE = 60;

export default async function TraitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mine?: string; scope?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const scope = sp.scope === 'sold' ? 'sold' : sp.mine === '1' ? 'collection' : 'all';
  const parsedPage = Number(sp.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  if (!/^i\d+$/i.test(id)) notFound();
  const t = await getDict();
  const locale = await getLocale();
  let trait: VndbTrait | null = null;
  let characters: VndbCharacter[] = [];
  let scopedCount: number | null = null;
  let hasMore = false;
  let error: string | null = null;
  const collection = getCollectionCoreRepository();
  const [ownedIds, archivedIds] = await Promise.all([
    collection.listIds(),
    scope === 'sold' ? collection.listIds('sold') : Promise.resolve(null),
  ]);
  const ownedVnIds = new Set(ownedIds);
  try {
    trait = await getTrait(id);
    if (trait) {
      if (scope !== 'all') {
        const matches = await getCharactersForTraitInVns(id, archivedIds ?? ownedIds);
        scopedCount = matches.length;
        const pageStart = (page - 1) * TRAIT_CHARACTER_PAGE_SIZE;
        characters = matches.slice(pageStart, pageStart + TRAIT_CHARACTER_PAGE_SIZE);
        hasMore = pageStart + TRAIT_CHARACTER_PAGE_SIZE < matches.length;
      } else {
        const response = await getCharactersForTraitPage(id, { results: TRAIT_CHARACTER_PAGE_SIZE, page });
        characters = response.results;
        hasMore = response.more;
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }
  if (!trait && !error) notFound();
  if (!trait) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/traits" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.traits}
        </Link>
        <div className="rounded-2xl border border-status-dropped/40 bg-status-dropped/5 p-6">
          <h1 className="mb-2 text-xl font-bold text-status-dropped">{t.detail.notFoundTitle}</h1>
          <p className="text-sm text-muted">{error}</p>
          <p className="mt-4 text-xs text-muted">
            <a
              href={`https://vndb.org/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              {t.detail.openOnVndb} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </div>
      </div>
    );
  }

  const allCount = trait.char_count;
  const visible = characters;
  const [localPaths, soldVnIds] = await Promise.all([
    getPeopleRepository().characterImages(visible.map((c) => c.id)),
    archivedIds ? Promise.resolve(new Set(archivedIds))
      : collection.soldIds(visible.flatMap((c) => c.vns.map((vn) => vn.id))),
  ]);
  const pageHref = (nextPage: number, nextScope: 'all' | 'collection' | 'sold'): string => {
    const query = new URLSearchParams();
    if (nextScope === 'collection') query.set('mine', '1');
    if (nextScope === 'sold') query.set('scope', 'sold');
    if (nextPage > 1) query.set('page', String(nextPage));
    const suffix = query.toString();
    return `/trait/${id}${suffix ? `?${suffix}` : ''}`;
  };

  return (
    <DensityScopeProvider scope="characterWorks" className="w-full">
      <Link href="/traits" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.traits}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-baseline gap-2 text-2xl font-bold">
              <Sparkles className="h-6 w-6 text-accent" aria-hidden />
              {trait.group_name && <span className="text-muted">{trait.group_name} /</span>}
              {trait.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{fmtNum(trait.char_count, locale)} {t.traits.charCount}</span>
              {trait.aliases.length > 0 && <span>/ {trait.aliases.slice(0, 4).join(', ')}</span>}
              {trait.sexual && (
                <span className="rounded bg-status-dropped/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-dropped">
                  R18
                </span>
              )}
            </div>
            {trait.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                <VndbMarkup text={trait.description} spoilerLabel={t.spoiler.markupSummary} />
              </p>
            )}
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Density slider controls the character grid below. */}
            <CardDensitySlider scope="characterWorks" className="w-full min-w-0 sm:w-auto" />
            <a
              href={`https://vndb.org/${trait.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn w-full justify-center sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> VNDB
            </a>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            {t.traits.charactersWith} / {scopedCount ?? allCount}
            {scope === 'collection' && scopedCount != null && (
              <span className="text-[10px] font-normal opacity-70">
                / {scopedCount} / {allCount} {t.traits.mineCountSuffix}
              </span>
            )}
          </h2>
          <nav className="inline-flex flex-wrap rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]" aria-label={t.traits.charactersWith}>
            <Link
              href={pageHref(1, 'all')}
              aria-current={scope === 'all' ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center rounded px-2 py-1 transition-colors can-hover:sm:min-h-0 ${
                scope === 'all' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
              }`}
            >
              {t.traits.all} / {allCount}
            </Link>
            <Link
              href={pageHref(1, 'collection')}
              aria-current={scope === 'collection' ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center rounded px-2 py-1 transition-colors can-hover:sm:min-h-0 ${
                scope === 'collection' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
              }`}
            >
              {t.traits.mine}{scope === 'collection' && scopedCount != null ? ` / ${scopedCount}` : ''}
            </Link>
            <Link
              href={pageHref(1, 'sold')}
              aria-current={scope === 'sold' ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center rounded px-2 py-1 transition-colors can-hover:sm:min-h-0 ${
                scope === 'sold' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
              }`}
            >
              {t.status.sold}{scope === 'sold' && scopedCount != null ? ` / ${scopedCount}` : ''}
            </Link>
          </nav>
        </div>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {scope === 'collection' ? t.traits.mineEmpty : t.search.noResults}
          </p>
        ) : (
          <ul
            className="grid gap-3"
            // Honour the shared density variable instead of pinning
            // 180px so the per-page slider tunes the column floor.
            style={{
              gridTemplateColumns:
                'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
            }}
          >
            {visible.map((c) => {
              const owned = c.vns.find((v) => ownedVnIds.has(v.id));
              const sold = c.vns.find((v) => soldVnIds.has(v.id));
              const primaryVn = scope === 'sold' ? sold : owned ?? sold;
              const firstVn = primaryVn ?? c.vns[0];
              const showOwned = !!firstVn && ownedVnIds.has(firstVn.id);
              return (
                <li key={c.id}>
                  <Link
                    href={`/character/${c.id}`}
                    className={`group flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors hover:border-accent ${
                      showOwned ? 'border-accent/40' : 'border-border'
                    }`}
                  >
                    {/* Density-aware character cover. */}
                    <div
                      className="shrink-0 overflow-hidden rounded"
                      style={{
                        width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.32), 160px)',
                        aspectRatio: '2 / 3',
                      }}
                    >
                      <SafeImage
                        src={c.image?.url ?? null}
                        localSrc={localPaths.get(c.id)?.local_path ?? null}
                        sexual={c.image?.sexual ?? null}
                        alt={c.name}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span title={c.name} className="line-clamp-2 text-xs font-bold transition-colors can-hover:group-hover:text-accent">
                        {c.name}
                      </span>
                      {c.original && c.original !== c.name && (
                        <div title={c.original} className="mt-0.5 line-clamp-1 text-[10px] text-muted">{c.original}</div>
                      )}
                      {firstVn && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted">
                          <CornerDownRight className="h-2.5 w-2.5" aria-hidden />
                          <span title={firstVn.title ?? firstVn.id} className="line-clamp-1">{firstVn.title ?? firstVn.id}</span>
                          {showOwned && <Check className="h-2.5 w-2.5 text-accent" aria-hidden />}
                          {soldVnIds.has(firstVn.id) && <StatusBadge status="sold" className="shrink-0" />}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {(page > 1 || hasMore) && (
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label={t.traits.paginationLabel}>
            {page > 1 ? (
              <Link href={pageHref(page - 1, scope)} className="btn min-h-[44px]">
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t.common.prev}
              </Link>
            ) : <span />}
            <span className="text-xs text-muted">{fmtNum(page, locale)}</span>
            {hasMore ? (
              <Link href={pageHref(page + 1, scope)} className="btn min-h-[44px]">
                {t.common.next}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </DensityScopeProvider>
  );
}
