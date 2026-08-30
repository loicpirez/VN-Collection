import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Mic2,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { NavTabStrip } from '@/components/NavTabStrip';
import { SafeImage } from '@/components/SafeImage';
import { getVoiceActorRepository, type VoiceActorBrowseOptions } from '@/lib/db/repositories/voice-actors';
import { getDict, getLocale } from '@/lib/i18n/server';
import { languageDisplayName } from '@/lib/language-names';
import { fmtNum } from '@/lib/locale-number';
import {
  parseVoiceActorBrowseParams,
  VOICE_ACTOR_MINIMUMS,
  voiceActorBrowseHref,
} from '@/lib/voice-actor-browse';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Build localized metadata for the dedicated local seiyuu index. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.seiyuuBrowse.pageTitle };
}

function careerLabel(firstYear: number | null, lastYear: number | null, unknown: string): string {
  if (firstYear === null || lastYear === null) return unknown;
  return firstYear === lastYear ? String(firstYear) : `${firstYear} - ${lastYear}`;
}

function pageHref(options: VoiceActorBrowseOptions, page: number): string {
  return voiceActorBrowseHref({ ...options, page });
}

/** Server-rendered ranking and browser for voice actors present in local credit data. */
export default async function SeiyuuPage({ searchParams }: PageProps) {
  const [t, locale, rawSearchParams] = await Promise.all([getDict(), getLocale(), searchParams]);
  const options = parseVoiceActorBrowseParams(rawSearchParams);
  const result = await getVoiceActorRepository().browse(options);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstRank = (result.page - 1) * result.pageSize;
  const hasFilters = options.query !== ''
    || options.language !== null
    || options.scope !== 'all'
    || options.sort !== 'vns'
    || options.direction !== 'desc'
    || options.minimumVns !== 1;

  return (
    <DensityScopeProvider scope="staffWorks" className="w-full">
      <Link href="/" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.library}
      </Link>

      <header className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
              <Mic2 className="h-6 w-6 text-accent" aria-hidden /> {t.seiyuuBrowse.pageTitle}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">{t.seiyuuBrowse.pageSubtitle}</p>
          </div>
          <div className="w-full sm:w-auto">
            <CardDensitySlider scope="staffWorks" />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 border-y border-border sm:grid-cols-3 xl:grid-cols-6">
          {[
            [t.seiyuuBrowse.statsActors, result.stats.actorCount],
            [t.seiyuuBrowse.statsVns, result.stats.vnCount],
            [t.seiyuuBrowse.statsCharacters, result.stats.characterCount],
            [t.seiyuuBrowse.statsCredits, result.stats.creditCount],
            [t.seiyuuBrowse.statsCollection, result.stats.collectionActorCount],
            [t.seiyuuBrowse.statsCollectionVns, result.stats.collectionVnCount],
          ].map(([label, value], index) => (
            <div key={String(label)} className={`px-3 py-3 ${index > 0 ? 'border-l border-border' : ''}`}>
              <dt className="text-[10px] font-semibold uppercase text-muted">{label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{fmtNum(Number(value), locale)}</dd>
            </div>
          ))}
        </dl>

        <NavTabStrip
          className="mt-4"
          ariaLabel={t.seiyuuBrowse.scopeLabel}
          tabs={[
            {
              href: voiceActorBrowseHref({ ...options, scope: 'all', page: 1 }),
              label: t.seiyuuBrowse.scopeAll,
              isActive: options.scope === 'all',
            },
            {
              href: voiceActorBrowseHref({ ...options, scope: 'collection', page: 1 }),
              label: t.seiyuuBrowse.scopeCollection,
              isActive: options.scope === 'collection',
            },
          ]}
        />

        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(130px,auto))_auto]">
          {options.scope === 'collection' && <input type="hidden" name="scope" value="collection" />}
          <label className="min-w-0 text-[10px] font-semibold uppercase text-muted">
            {t.seiyuuBrowse.searchLabel}
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={options.query}
                placeholder={t.seiyuuBrowse.searchPlaceholder}
                className="input min-h-[44px] w-full pl-9 normal-case"
              />
            </span>
          </label>
          <label className="text-[10px] font-semibold uppercase text-muted">
            {t.seiyuuBrowse.languageLabel}
            <select name="lang" defaultValue={options.language ?? ''} className="input mt-1 min-h-[44px] w-full normal-case">
              <option value="">{t.seiyuuBrowse.allLanguages}</option>
              {result.languages.map((facet) => (
                <option key={facet.language} value={facet.language}>
                  {languageDisplayName(facet.language, locale)} ({fmtNum(facet.actorCount, locale)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase text-muted">
            {t.seiyuuBrowse.sortLabel}
            <select name="sort" defaultValue={options.sort} className="input mt-1 min-h-[44px] w-full normal-case">
              {Object.entries(t.seiyuuBrowse.sort).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase text-muted">
            {t.seiyuuBrowse.directionLabel}
            <select name="direction" defaultValue={options.direction} className="input mt-1 min-h-[44px] w-full normal-case">
              <option value="desc">{t.seiyuuBrowse.directionDesc}</option>
              <option value="asc">{t.seiyuuBrowse.directionAsc}</option>
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase text-muted">
            {t.seiyuuBrowse.minimumLabel}
            <select name="minimum" defaultValue={String(options.minimumVns)} className="input mt-1 min-h-[44px] w-full normal-case">
              {VOICE_ACTOR_MINIMUMS.map((minimum) => (
                <option key={minimum} value={minimum}>
                  {t.seiyuuBrowse.minimumOption.replace('{count}', fmtNum(minimum, locale))}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
            <button type="submit" className="btn btn-primary min-h-[44px] flex-1 xl:flex-none">
              {t.seiyuuBrowse.apply}
            </button>
            {hasFilters && (
              <Link href="/seiyuu" className="btn min-h-[44px]" aria-label={t.seiyuuBrowse.clear} title={t.seiyuuBrowse.clear}>
                <RotateCcw className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </form>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {t.seiyuuBrowse.results.replace('{count}', fmtNum(result.total, locale))}
        </p>
        {pageCount > 1 && (
          <p className="text-xs tabular-nums text-muted">
            {t.seiyuuBrowse.pageStatus
              .replace('{current}', fmtNum(result.page, locale))
              .replace('{total}', fmtNum(pageCount, locale))}
          </p>
        )}
      </div>

      {result.rows.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted">{t.seiyuuBrowse.empty}</p>
      ) : (
        <ol
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, calc(var(--card-density-px, 220px) + 40px)), 1fr))',
          }}
        >
          {result.rows.map((actor, index) => {
            const rank = firstRank + index + 1;
            const overlapPercent = actor.vnCount > 0
              ? Math.round((actor.collectionVnCount / actor.vnCount) * 100)
              : 0;
            return (
              <li key={actor.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-bg-elev/35 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase text-accent">
                      {t.seiyuuBrowse.rank.replace('{count}', fmtNum(rank, locale))}
                    </span>
                    <Link
                      href={`/staff/${actor.id}`}
                      className="tap-target mt-0.5 flex items-center truncate text-base font-bold hover:text-accent"
                      title={actor.name}
                    >
                      {actor.name}
                    </Link>
                    {actor.original && actor.original !== actor.name && (
                      <p className="truncate text-xs text-muted" title={actor.original}>{actor.original}</p>
                    )}
                  </div>
                  {actor.language && (
                    <span className="shrink-0 rounded bg-bg-elev px-2 py-1 text-[10px] font-semibold text-muted">
                      {languageDisplayName(actor.language, locale)}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="font-semibold">{t.seiyuuBrowse.vnCount.replace('{count}', fmtNum(actor.vnCount, locale))}</span>
                  <span className="font-semibold">{t.seiyuuBrowse.characterCount.replace('{count}', fmtNum(actor.characterCount, locale))}</span>
                  <span className="text-muted">{t.seiyuuBrowse.collectionCount.replace('{count}', fmtNum(actor.collectionVnCount, locale))}</span>
                  <span className="text-muted">{t.seiyuuBrowse.creditCount.replace('{count}', fmtNum(actor.creditCount, locale))}</span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-sm bg-bg-deep"
                  role="progressbar"
                  aria-label={t.seiyuuBrowse.collectionCount.replace('{count}', fmtNum(actor.collectionVnCount, locale))}
                  aria-valuemin={0}
                  aria-valuemax={actor.vnCount}
                  aria-valuenow={actor.collectionVnCount}
                >
                  <div className="h-full bg-status-completed" style={{ width: `${overlapPercent}%` }} />
                </div>

                <div className="mt-3 text-[10px] text-muted">
                  <span className="font-semibold uppercase">{t.seiyuuBrowse.career}</span>
                  <span className="ml-2 tabular-nums text-fg">
                    {careerLabel(actor.firstYear, actor.lastYear, t.seiyuuBrowse.unknownYear)}
                  </span>
                </div>

                {actor.aliases.length > 0 && (
                  <p className="mt-2 line-clamp-2 text-[10px] text-muted" title={actor.aliases.join(' / ')}>
                    <span className="font-semibold uppercase">{t.seiyuuBrowse.aliases}:</span>{' '}
                    {actor.aliases.join(' / ')}
                  </p>
                )}

                {actor.characters.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted">{t.seiyuuBrowse.representativeRoles}</p>
                    <div className="flex gap-2">
                      {actor.characters.map((character) => (
                        <Link
                          key={character.id}
                          href={`/character/${character.id}`}
                          className="group min-w-0 flex-1"
                          title={`${character.name} - ${t.seiyuuBrowse.characterVnCount.replace('{count}', fmtNum(character.vnCount, locale))}`}
                        >
                          <SafeImage
                            src={character.imageUrl}
                            localSrc={character.localImage}
                            alt={character.name}
                            className="aspect-square w-full overflow-hidden rounded-md border border-border"
                            imageClassName="h-full w-full object-cover transition-transform can-hover:group-hover:scale-105"
                          />
                          <span className="mt-1 block truncate text-[10px] group-hover:text-accent">{character.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={`/staff/${actor.id}`}
                  className="mt-auto inline-flex min-h-[44px] items-center justify-between border-t border-border pt-3 text-xs font-semibold text-muted hover:text-accent"
                  aria-label={t.seiyuuBrowse.openProfile.replace('{name}', actor.name)}
                >
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden /> {actor.id}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {pageCount > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-3 border-t border-border pt-4" aria-label={t.seiyuuBrowse.pageStatus.replace('{current}', fmtNum(result.page, locale)).replace('{total}', fmtNum(pageCount, locale))}>
          {result.page > 1 ? (
            <Link href={pageHref(options, result.page - 1)} className="tap-target inline-flex items-center justify-center rounded-md border border-border" aria-label={t.common.prev}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <span className="tap-target inline-flex items-center justify-center rounded-md border border-border opacity-40" aria-hidden>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className="text-xs tabular-nums text-muted">
            {t.seiyuuBrowse.pageStatus.replace('{current}', fmtNum(result.page, locale)).replace('{total}', fmtNum(pageCount, locale))}
          </span>
          {result.page < pageCount ? (
            <Link href={pageHref(options, result.page + 1)} className="tap-target inline-flex items-center justify-center rounded-md border border-border" aria-label={t.common.next}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <span className="tap-target inline-flex items-center justify-center rounded-md border border-border opacity-40" aria-hidden>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          )}
        </nav>
      )}
    </DensityScopeProvider>
  );
}
