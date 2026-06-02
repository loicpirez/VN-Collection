import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, UserSquare, X } from 'lucide-react';
import { searchCharacters, type VndbCharacter } from '@/lib/vndb';

function isVndbCharacter(p: unknown): p is VndbCharacter {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.name === 'string' &&
    r.name.length > 0 &&
    Array.isArray(r.aliases) &&
    Array.isArray(r.vns) &&
    Array.isArray(r.traits)
  );
}
import { searchLocalCharacters } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { NavTabStrip } from '@/components/NavTabStrip';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import {
  characterBrowseHref,
  filterCharacters,
  groupCharacters,
  hasActiveCharacterFilter,
  parseCharacterBrowseParams,
  sortCharacters,
  type BloodType,
  type CharacterBrowseParams,
  type CharacterRole,
  type CharacterSex,
  type CharacterSort,
  type CharacterGroupBy,
} from '@/lib/character-browse';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 60;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const dict = await getDict();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : Array.isArray(sp.q) ? sp.q[0] : undefined;
  return { title: q ? `${q} - ${dict.charactersSearch.pageTitle}` : dict.charactersSearch.pageTitle };
}

/**
 * `/characters` - full-featured browsing experience.
 *
 * The page is server-rendered so the URL is the only source of
 * truth. It dispatches between three tabs (Local / VNDB / Combined)
 * and surfaces real filter controls (chip groups, range inputs,
 * segmented controls). Three behaviours that differ from a plain
 * search box:
 *
 *  1. When `q` matches `^c\d+$` we redirect server-side to the
 *     canonical `/character/<id>` page. The operator can paste a
 *     VNDB character id into the input and hit Enter (the form is
 *     a plain GET so the redirect lives on the same page load).
 *  2. When `q` is empty but at least one chip / range is active,
 *     the local tab still runs `searchLocalCharacters({...filters})`
 *     so the operator can browse "every female main lead I own"
 *     without typing a query. The previous build short-circuited
 *     to an idle hint.
 *  3. The reset button clears every chip / range while preserving
 *     the active query so the operator can dial filters back to
 *     zero without losing the search context.
 */
export default async function CharactersPage({ searchParams }: PageProps) {
  const t = await getDict();
  const sp = await searchParams;
  const params = parseCharacterBrowseParams(sp);
  const includeEro = sp.ero === '1';
  const tab = params.tab;
  const query = params.q;
  const rawPage = typeof sp.page === 'string' ? Number(sp.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  if (/^c\d+$/i.test(query)) {
    redirect(`/character/${query.toLowerCase()}`);
  }

  const hasFilters = hasActiveCharacterFilter(params);
  // Always fetch local results - local tab browses all, VNDB tab uses
  // local as fallback when no text query is active.
  const localResults: VndbCharacter[] = searchLocalCharacters({ q: query || undefined, limit: 200 }).flatMap(
    (row) => {
      const p = row.profile;
      if (!isVndbCharacter(p)) return [];
      return [{ ...p, voice_languages: row.voice_languages }];
    },
  );
  let vndbResults: VndbCharacter[] = [];
  // Hit the VNDB API for any non-local tab - including empty-query on
  // VNDB tab so the operator can browse without typing a name first.
  if (tab !== 'local') {
    vndbResults = await searchCharacters(query, {
      results: 60,
      ageMin: params.ageMin ?? undefined,
      ageMax: params.ageMax ?? undefined,
      heightMin: params.heightMin ?? undefined,
      heightMax: params.heightMax ?? undefined,
      bustMin: params.bustMin ?? undefined,
      bustMax: params.bustMax ?? undefined,
      waistMin: params.waistMin ?? undefined,
      waistMax: params.waistMax ?? undefined,
      hipsMin: params.hipsMin ?? undefined,
      hipsMax: params.hipsMax ?? undefined,
      blood: params.blood ?? undefined,
      sex: params.sex ?? undefined,
      role: params.role ?? undefined,
    }).catch(() => []);
  }
  const allResults =
    tab === 'local'
      ? localResults
      : tab === 'vndb'
        ? vndbResults
        : dedupeCharacters([...localResults, ...vndbResults]);
  const shouldQuery = tab !== 'vndb' || vndbResults.length > 0 || hasFilters || localResults.length > 0;
  const ageGated = includeEro
    ? allResults
    : allResults.filter((c) => !((c.image?.sexual ?? 0) >= 1.5));
  const filtered = filterCharacters(ageGated, params);
  const sorted = sortCharacters(filtered, params);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const groups = groupCharacters(paged, params.groupBy);

  const ranges = {
    ageMin: params.ageMin?.toString() ?? '',
    ageMax: params.ageMax?.toString() ?? '',
    heightMin: params.heightMin?.toString() ?? '',
    heightMax: params.heightMax?.toString() ?? '',
    bustMin: params.bustMin?.toString() ?? '',
    bustMax: params.bustMax?.toString() ?? '',
    waistMin: params.waistMin?.toString() ?? '',
    waistMax: params.waistMax?.toString() ?? '',
    hipsMin: params.hipsMin?.toString() ?? '',
    hipsMax: params.hipsMax?.toString() ?? '',
  };

  const resetHref = characterBrowseHref(params, {
    role: null,
    sex: null,
    blood: null,
    vaLang: null,
    hasVoice: null,
    hasImage: null,
    birthMonth: null,
    ageMin: null,
    ageMax: null,
    heightMin: null,
    heightMax: null,
    bustMin: null,
    bustMax: null,
    waistMin: null,
    waistMax: null,
    hipsMin: null,
    hipsMax: null,
  });

  return (
    <DensityScopeProvider scope="characterWorks" as="main" className="w-full">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.library}
      </Link>

      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <UserSquare className="h-6 w-6 text-accent" aria-hidden /> {t.charactersSearch.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.charactersSearch.pageSubtitle}</p>

        <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            inputMode="search"
            name="q"
            defaultValue={query}
            placeholder={t.charactersSearch.searchPlaceholder}
            aria-label={t.charactersSearch.searchPlaceholder}
            className="input flex-1 min-w-[140px] sm:min-w-[200px]"
          />
          {tab !== 'local' && <input type="hidden" name="tab" value={tab} />}
          {forwardChip('role', params.role)}
          {forwardChip('sex', params.sex)}
          {forwardChip('bloodType', params.blood)}
          {forwardChip('vaLang', params.vaLang)}
          {params.hasVoice != null && <input type="hidden" name="hasVoice" value={params.hasVoice ? '1' : '0'} />}
          {params.hasImage != null && <input type="hidden" name="hasImage" value={params.hasImage ? '1' : '0'} />}
          {forwardChip('birthMonth', params.birthMonth?.toString() ?? null)}
          {forwardChip('ageMin', params.ageMin?.toString() ?? null)}
          {forwardChip('ageMax', params.ageMax?.toString() ?? null)}
          {forwardChip('heightMin', params.heightMin?.toString() ?? null)}
          {forwardChip('heightMax', params.heightMax?.toString() ?? null)}
          {params.sort !== 'name' && <input type="hidden" name="sort" value={params.sort} />}
          {params.reverse && <input type="hidden" name="reverse" value="1" />}
          {params.groupBy && <input type="hidden" name="groupBy" value={params.groupBy} />}
          <label className="inline-flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              name="ero"
              value="1"
              defaultChecked={includeEro}
              className="accent-accent"
            />
            {t.charactersSearch.includeEro}
          </label>
          <button type="submit" className="btn">
            {t.search.run}
          </button>
        </form>

        {/*
          R5-156: navigates between URL states (full route render
          with new searchParams). Plain `<nav>` + `aria-current=
          "page"` on the active link - no `role="tablist"` /
          `role="tab"` without matching `tabpanel`.
        */}
        <NavTabStrip
          className="mt-3"
          ariaLabel={t.charactersSearch.tabLocal}
          tabs={[
            { href: characterBrowseHref(params, { tab: null }), label: t.charactersSearch.tabLocal, isActive: tab === 'local' },
            { href: characterBrowseHref(params, { tab: 'vndb' }), label: t.charactersSearch.tabVndb, isActive: tab === 'vndb' },
            { href: characterBrowseHref(params, { tab: 'combined' }), label: t.charactersSearch.tabCombined, isActive: tab === 'combined' },
          ]}
        />

        {/* Segmented controls - each row is a labelled group of `.chip` /
            `.chip-active` buttons so the visual contract matches the rest of
            the toolbar. Tooltips on icon-only chips via `title`. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SegmentRow label={t.charactersSearch.filters.role}>
            <ChipLink active={params.role == null} href={characterBrowseHref(params, { role: null })}>
              {t.charactersSearch.filters.any}
            </ChipLink>
            {(['main', 'primary', 'side', 'appears'] as const satisfies readonly CharacterRole[]).map((r) => (
              <ChipLink
                key={r}
                active={params.role === r}
                href={characterBrowseHref(params, { role: params.role === r ? null : r })}
              >
                {t.charactersSearch.role[r]}
              </ChipLink>
            ))}
          </SegmentRow>

          <SegmentRow label={t.charactersSearch.filters.sex}>
            <ChipLink active={params.sex == null} href={characterBrowseHref(params, { sex: null })}>
              {t.charactersSearch.filters.any}
            </ChipLink>
            {(['f', 'm', 'b', 'n'] as const satisfies readonly CharacterSex[]).map((s) => (
              <ChipLink
                key={s}
                active={params.sex === s}
                href={characterBrowseHref(params, { sex: params.sex === s ? null : s })}
              >
                {t.charactersSearch.sex[s]}
              </ChipLink>
            ))}
          </SegmentRow>

          <SegmentRow label={t.charactersSearch.filters.blood}>
            <ChipLink active={params.blood == null} href={characterBrowseHref(params, { blood: null })}>
              {t.charactersSearch.filters.any}
            </ChipLink>
            {(['a', 'b', 'ab', 'o'] as const satisfies readonly BloodType[]).map((b) => (
              <ChipLink
                key={b}
                active={params.blood === b}
                href={characterBrowseHref(params, { blood: params.blood === b ? null : b })}
                className="uppercase"
              >
                {b}
              </ChipLink>
            ))}
          </SegmentRow>

          <SegmentRow label={t.charactersSearch.filters.toggles}>
            <ChipLink
              active={params.hasImage === true}
              href={characterBrowseHref(params, { hasImage: params.hasImage === true ? null : true })}
              title={t.charactersSearch.hasImage}
            >
              {t.charactersSearch.hasImage}
            </ChipLink>
            <ChipLink
              active={params.hasVoice === true}
              href={characterBrowseHref(params, { hasVoice: params.hasVoice === true ? null : true })}
              title={t.charactersSearch.hasVoice}
            >
              {t.charactersSearch.hasVoice}
            </ChipLink>
          </SegmentRow>
        </div>

        {/* Range / numeric inputs - submit via the same GET form
            above. The form encompasses the toolbar, so each input
            posts back its name on submission. */}
        <form method="get" className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <input type="hidden" name="q" value={query} />
          {tab !== 'local' && <input type="hidden" name="tab" value={tab} />}
          {forwardChip('role', params.role)}
          {forwardChip('sex', params.sex)}
          {forwardChip('bloodType', params.blood)}
          {params.hasVoice != null && <input type="hidden" name="hasVoice" value={params.hasVoice ? '1' : '0'} />}
          {params.hasImage != null && <input type="hidden" name="hasImage" value={params.hasImage ? '1' : '0'} />}
          {params.sort !== 'name' && <input type="hidden" name="sort" value={params.sort} />}
          {params.reverse && <input type="hidden" name="reverse" value="1" />}
          {params.groupBy && <input type="hidden" name="groupBy" value={params.groupBy} />}

          <RangeFieldset
            legend={t.charactersSearch.filters.age}
            minName="ageMin" maxName="ageMax"
            min={0} max={200}
            minDefault={ranges.ageMin} maxDefault={ranges.ageMax}
            minLabel={t.charactersSearch.filters.ageMin}
            maxLabel={t.charactersSearch.filters.ageMax}
            placeholder={t.charactersSearch.filters}
          />

          <RangeFieldset
            legend={t.charactersSearch.filters.height}
            minName="heightMin" maxName="heightMax"
            min={0} max={300}
            minDefault={ranges.heightMin} maxDefault={ranges.heightMax}
            minLabel={t.charactersSearch.filters.heightMin}
            maxLabel={t.charactersSearch.filters.heightMax}
            placeholder={t.charactersSearch.filters}
          />

          <RangeFieldset
            legend={t.charactersSearch.filters.bust}
            minName="bustMin" maxName="bustMax"
            min={0} max={200}
            minDefault={ranges.bustMin} maxDefault={ranges.bustMax}
            minLabel={t.charactersSearch.filters.bustMin}
            maxLabel={t.charactersSearch.filters.bustMax}
            placeholder={t.charactersSearch.filters}
          />

          <RangeFieldset
            legend={t.charactersSearch.filters.waist}
            minName="waistMin" maxName="waistMax"
            min={0} max={200}
            minDefault={ranges.waistMin} maxDefault={ranges.waistMax}
            minLabel={t.charactersSearch.filters.waistMin}
            maxLabel={t.charactersSearch.filters.waistMax}
            placeholder={t.charactersSearch.filters}
          />

          <RangeFieldset
            legend={t.charactersSearch.filters.hips}
            minName="hipsMin" maxName="hipsMax"
            min={0} max={200}
            minDefault={ranges.hipsMin} maxDefault={ranges.hipsMax}
            minLabel={t.charactersSearch.filters.hipsMin}
            maxLabel={t.charactersSearch.filters.hipsMax}
            placeholder={t.charactersSearch.filters}
          />

          <fieldset className="rounded-md border border-border bg-bg-elev/30 p-2">
            <legend className="px-1 text-[10px] uppercase tracking-wider text-muted">
              {t.charactersSearch.filters.misc}
            </legend>
            <div className="flex items-center gap-1">
              <select
                name="birthMonth"
                defaultValue={params.birthMonth?.toString() ?? ''}
                aria-label={t.charactersSearch.filters.birthMonth}
                className="input w-full"
              >
                <option value="">{t.charactersSearch.filters.birthMonthAny}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {t.charactersSearch.filters.month.replace('{n}', String(m))}
                  </option>
                ))}
              </select>
              <select
                name="vaLang"
                defaultValue={params.vaLang ?? ''}
                aria-label={t.charactersSearch.filters.vaLang}
                className="input w-full"
              >
                <option value="">{t.charactersSearch.filters.vaLangAny}</option>
                <option value="ja">ja</option>
                <option value="en">en</option>
                <option value="zh-Hans">zh-Hans</option>
                <option value="zh-Hant">zh-Hant</option>
                <option value="ko">ko</option>
              </select>
            </div>
          </fieldset>

          <div className="flex items-center gap-2 sm:col-span-3">
            <button type="submit" className="btn">
              {t.charactersSearch.filters.apply}
            </button>
            {hasFilters && (
              <Link href={resetHref} className="chip" aria-label={t.charactersSearch.resetFilters}>
                <X className="inline h-3 w-3" aria-hidden /> {t.charactersSearch.resetFilters}
              </Link>
            )}
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">{t.charactersSearch.sortLabel}</span>
          {(['name', 'height', 'age', 'birthday'] as const satisfies readonly CharacterSort[]).map((s) => (
            <ChipLink
              key={s}
              active={params.sort === s}
              href={characterBrowseHref(params, { sort: s === 'name' ? null : s })}
            >
              {t.charactersSearch.sort[s]}
            </ChipLink>
          ))}
          <ChipLink
            active={params.reverse}
            href={characterBrowseHref(params, { reverse: params.reverse ? null : true })}
          >
            {t.charactersSearch.reverse}
          </ChipLink>
          <span className="ml-2 text-muted">{t.charactersSearch.groupLabel}</span>
          {(['', 'blood', 'birthMonth', 'sex', 'role'] as const satisfies readonly CharacterGroupBy[]).map((g) => (
            <ChipLink
              key={g || 'none'}
              active={params.groupBy === g}
              href={characterBrowseHref(params, { groupBy: g || null })}
            >
              {g ? t.charactersSearch.group[g] : t.charactersSearch.group.none}
            </ChipLink>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CardDensitySlider scope="characterWorks" />
        </div>
      </header>

      {!shouldQuery ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.charactersSearch.idleHint}
        </p>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          <p>{t.charactersSearch.empty}</p>
          {tab !== 'vndb' && (
            <Link
              href={characterBrowseHref(params, { tab: 'vndb' })}
              className="mt-2 inline-block text-xs text-accent hover:underline"
            >
              {t.charactersSearch.tabVndb}
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {sorted.length} {t.charactersSearch.resultsCount}
            {pageCount > 1 && (
              <span className="ml-2">
                {t.charactersSearch.pageLabel.replace('{current}', String(currentPage)).replace('{total}', String(pageCount))}
              </span>
            )}
            {localResults.length >= 200 && tab !== 'vndb' && (
              <span className="ml-2 text-status-on_hold">
                {t.charactersSearch.localLimitNotice}
              </span>
            )}
          </p>
          {groups.map((bucket) => (
            <section key={bucket.key} className="mb-6">
              {params.groupBy && (
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                  {bucket.key || 'unknown'}
                </h2>
              )}
              <ul
                className="grid gap-3"
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
                }}
              >
                {bucket.items.map((c) => {
                  const primarySex = c.sex?.[0];
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/character/${c.id}`}
                        className="group flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden rounded">
                          <SafeImage
                            src={c.image?.url ?? null}
                            localSrc={null}
                            sexual={c.image?.sexual ?? null}
                            alt={c.name}
                            className="h-full w-full"
                          />
                        </div>
                        <p className="line-clamp-2 text-xs font-bold transition-colors can-hover:group-hover:text-accent" title={c.name}>
                          {c.name}
                        </p>
                        {c.original && (
                          <p className="line-clamp-1 text-[11px] text-muted" title={c.original}>{c.original}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          {primarySex && (
                            <span className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5">
                              {t.charactersSearch.sex[primarySex as CharacterSex] ?? primarySex}
                            </span>
                          )}
                          {c.age != null && <span>{t.charactersSearch.ageSuffix.replace('{n}', String(c.age))}</span>}
                          {c.height != null && <span>{t.charactersSearch.heightSuffix.replace('{n}', String(c.height))}</span>}
                          {c.blood_type && <span className="uppercase">{c.blood_type}</span>}
                        </div>
                        <p className="text-[10px] text-muted/70">
                          {((c.vns?.length ?? 0) === 1
                            ? t.charactersSearch.vnCountSingular
                            : t.charactersSearch.vnCount
                          ).replace('{n}', String(c.vns?.length ?? 0))}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {pageCount > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs" aria-label={t.charactersSearch.paginationLabel}>
              <Link
                href={characterPageHref(sp, Math.max(1, currentPage - 1))}
                aria-disabled={currentPage === 1}
                className={`btn ${currentPage === 1 ? 'pointer-events-none opacity-40' : ''}`}
              >
                {t.charactersSearch.prevPage}
              </Link>
              <span className="text-muted">
                {t.charactersSearch.pageLabel.replace('{current}', String(currentPage)).replace('{total}', String(pageCount))}
              </span>
              <Link
                href={characterPageHref(sp, Math.min(pageCount, currentPage + 1))}
                aria-disabled={currentPage === pageCount}
                className={`btn ${currentPage === pageCount ? 'pointer-events-none opacity-40' : ''}`}
              >
                {t.charactersSearch.nextPage}
              </Link>
            </nav>
          )}
        </>
      )}
    </DensityScopeProvider>
  );
}

function characterPageHref(sp: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === 'page') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (typeof value === 'string' && value) {
      params.set(key, value);
    }
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/characters?${qs}` : '/characters';
}

function forwardChip(name: string, value: string | null) {
  if (!value) return null;
  return <input type="hidden" name={name} value={value} />;
}

function RangeFieldset({
  legend,
  minName, maxName,
  min, max,
  minDefault, maxDefault,
  minLabel, maxLabel,
  placeholder,
}: {
  legend: string;
  minName: string; maxName: string;
  min: number; max: number;
  minDefault: string; maxDefault: string;
  minLabel: string; maxLabel: string;
  placeholder: { min: string; max: string };
}) {
  return (
    <fieldset className="rounded-md border border-border bg-bg-elev/30 p-2">
      <legend className="px-1 text-[10px] uppercase tracking-wider text-muted">{legend}</legend>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          name={minName}
          min={min}
          max={max}
          defaultValue={minDefault}
          placeholder={placeholder.min}
          aria-label={minLabel}
          className="input w-full"
        />
        <span className="text-muted">-</span>
        <input
          type="number"
          inputMode="numeric"
          name={maxName}
          min={min}
          max={max}
          defaultValue={maxDefault}
          placeholder={placeholder.max}
          aria-label={maxLabel}
          className="input w-full"
        />
      </div>
    </fieldset>
  );
}

function SegmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted">{label}:</span>
      {children}
    </div>
  );
}

function ChipLink({
  active,
  href,
  children,
  className,
  title,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const cls = active ? 'chip chip-active' : 'chip';
  return (
    <Link href={href} className={[cls, className].filter(Boolean).join(' ')} aria-pressed={active} title={title}>
      {children}
    </Link>
  );
}

function dedupeCharacters(list: VndbCharacter[]): VndbCharacter[] {
  // Combined-tab dedup. Prefer the row that carries an image so the
  // operator gets a thumbnail when at least one of the local / VNDB
  // copies has one cached.
  const map = new Map<string, VndbCharacter>();
  for (const c of list) {
    const prev = map.get(c.id);
    if (!prev) {
      map.set(c.id, c);
      continue;
    }
    if (!prev.image?.url && c.image?.url) {
      map.set(c.id, c);
    }
  }
  return [...map.values()];
}

// `CharacterBrowseParams` is re-exported so the helper file stays the
// canonical owner of the type contract; the page just narrows it here.
export type { CharacterBrowseParams };
