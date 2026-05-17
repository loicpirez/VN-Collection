import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, UserSquare, X } from 'lucide-react';
import { searchCharacters, type VndbCharacter } from '@/lib/vndb';
import { searchLocalCharacters } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
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

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const dict = await getDict();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : Array.isArray(sp.q) ? sp.q[0] : undefined;
  return { title: q ? `${q} — ${dict.charactersSearch.pageTitle}` : dict.charactersSearch.pageTitle };
}

/**
 * `/characters` — full-featured browsing experience.
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

  if (/^c\d+$/i.test(query)) {
    redirect(`/character/${query.toLowerCase()}`);
  }

  const hasFilters = hasActiveCharacterFilter(params);
  const shouldQuery = query.length > 0 || hasFilters;

  let localResults: VndbCharacter[] = [];
  if (shouldQuery && tab !== 'vndb') {
    localResults = searchLocalCharacters({ q: query || undefined, limit: 200 }).map(
      (row) => ({
        ...(row.profile as unknown as VndbCharacter),
        voice_languages: row.voice_languages,
      }),
    );
  }
  let vndbResults: VndbCharacter[] = [];
  if (query && tab !== 'local') {
    vndbResults = await searchCharacters(query, { results: 60 }).catch(() => []);
  }
  const allResults =
    tab === 'local'
      ? localResults
      : tab === 'vndb'
        ? vndbResults
        : dedupeCharacters([...localResults, ...vndbResults]);
  const ageGated = includeEro
    ? allResults
    : allResults.filter((c) => !((c.image?.sexual ?? 0) >= 1.5));
  const filtered = filterCharacters(ageGated, params);
  const sorted = sortCharacters(filtered, params);
  const groups = groupCharacters(sorted, params.groupBy);

  const ranges = {
    ageMin: params.ageMin?.toString() ?? '',
    ageMax: params.ageMax?.toString() ?? '',
    heightMin: params.heightMin?.toString() ?? '',
    heightMax: params.heightMax?.toString() ?? '',
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
  });

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <UserSquare className="h-6 w-6 text-accent" aria-hidden /> {t.charactersSearch.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.charactersSearch.pageSubtitle}</p>

        <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t.charactersSearch.searchPlaceholder}
            aria-label={t.charactersSearch.searchPlaceholder}
            className="input flex-1 min-w-[200px]"
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

        <nav className="mt-3 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs" role="tablist">
          {(['local', 'vndb', 'combined'] as const).map((tk) => (
            <Link
              key={tk}
              href={characterBrowseHref(params, { tab: tk === 'local' ? null : tk })}
              role="tab"
              aria-selected={tab === tk}
              className={`rounded px-2.5 py-1 ${tab === tk ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
            >
              {tk === 'local' ? t.charactersSearch.tabLocal : tk === 'vndb' ? t.charactersSearch.tabVndb : t.charactersSearch.tabCombined}
            </Link>
          ))}
        </nav>

        {/* Segmented controls — each row is a labelled group of `.chip` /
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

        {/* Range / numeric inputs — submit via the same GET form
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

          <fieldset className="rounded-md border border-border bg-bg-elev/30 p-2">
            <legend className="px-1 text-[10px] uppercase tracking-wider text-muted">
              {t.charactersSearch.filters.age}
            </legend>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                name="ageMin"
                min={0}
                max={200}
                defaultValue={ranges.ageMin}
                placeholder={t.charactersSearch.filters.min}
                aria-label={t.charactersSearch.filters.ageMin}
                className="input w-full"
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                inputMode="numeric"
                name="ageMax"
                min={0}
                max={200}
                defaultValue={ranges.ageMax}
                placeholder={t.charactersSearch.filters.max}
                aria-label={t.charactersSearch.filters.ageMax}
                className="input w-full"
              />
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border bg-bg-elev/30 p-2">
            <legend className="px-1 text-[10px] uppercase tracking-wider text-muted">
              {t.charactersSearch.filters.height}
            </legend>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                name="heightMin"
                min={0}
                max={300}
                defaultValue={ranges.heightMin}
                placeholder={t.charactersSearch.filters.min}
                aria-label={t.charactersSearch.filters.heightMin}
                className="input w-full"
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                inputMode="numeric"
                name="heightMax"
                min={0}
                max={300}
                defaultValue={ranges.heightMax}
                placeholder={t.charactersSearch.filters.max}
                aria-label={t.charactersSearch.filters.heightMax}
                className="input w-full"
              />
            </div>
          </fieldset>

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
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
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
                        <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                          {c.name}
                        </p>
                        {c.original && (
                          <p className="line-clamp-1 text-[11px] text-muted">{c.original}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          {primarySex && (
                            <span className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5">
                              {t.charactersSearch.sex[primarySex as CharacterSex] ?? primarySex}
                            </span>
                          )}
                          {c.age != null && <span>{c.age}y</span>}
                          {c.height != null && <span>{c.height}cm</span>}
                          {c.blood_type && <span className="uppercase">{c.blood_type}</span>}
                        </div>
                        <p className="text-[10px] text-muted/70">
                          {c.vns?.length ?? 0} VN{(c.vns?.length ?? 0) > 1 ? 's' : ''}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function forwardChip(name: string, value: string | null) {
  if (!value) return null;
  return <input type="hidden" name={name} value={value} />;
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
