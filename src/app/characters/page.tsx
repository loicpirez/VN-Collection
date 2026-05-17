import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserSquare, X } from 'lucide-react';
import { searchCharacters } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import {
  characterBrowseHref,
  filterCharacters,
  groupCharacters,
  parseCharacterBrowseParams,
  sortCharacters,
  type BloodType,
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
 * /characters — real browsing experience.
 *
 * - Tabs: Local / VNDB / Combined.
 * - Filter chips: sex, role, blood type, seiyuu language, has-voice,
 *   has-image (every chip is a `<Link>` so the page is shareable).
 * - Sort: name / height / age / birthday-month + reverse toggle.
 * - Group-by: blood / birthMonth / sex / role.
 * - Cards: avatar, name, original, sex+age, role, # VN appearances.
 *
 * All filtering / sorting / grouping is done client-side over the
 * VNDB result set — VNDB's `/character` endpoint is rich but adding
 * predicates triples query latency for marginal gain on a 60-row
 * page. The chips ARE present in the URL so a refresh re-hydrates
 * the same view.
 */
export default async function CharactersPage({ searchParams }: PageProps) {
  const t = await getDict();
  const sp = await searchParams;
  const params = parseCharacterBrowseParams(sp);
  const includeEro = sp.ero === '1';
  const tab = params.tab;
  const query = params.q;

  const allResults = query
    ? await searchCharacters(query, { results: 60 }).catch(() => [])
    : [];
  const ageGated = includeEro
    ? allResults
    : allResults.filter((c) => !((c.image?.sexual ?? 0) >= 1.5));
  const filtered = filterCharacters(ageGated, params);
  const sorted = sortCharacters(filtered, params);
  const groups = groupCharacters(sorted, params.groupBy);

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
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          {tab !== 'local' && <input type="hidden" name="tab" value={tab} />}
          {params.role && <input type="hidden" name="role" value={params.role} />}
          {params.sex && <input type="hidden" name="sex" value={params.sex} />}
          {params.blood && <input type="hidden" name="blood" value={params.blood} />}
          {params.vaLang && <input type="hidden" name="vaLang" value={params.vaLang} />}
          {params.hasVoice != null && <input type="hidden" name="hasVoice" value={params.hasVoice ? '1' : '0'} />}
          {params.hasImage != null && <input type="hidden" name="hasImage" value={params.hasImage ? '1' : '0'} />}
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
              {tk === 'local' ? t.charactersSearch.tabLocal : tk === 'vndb' ? t.charactersSearch.tabVndb : t.charactersSearch.tabLocal + '+' + t.charactersSearch.tabVndb}
            </Link>
          ))}
        </nav>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">{t.charactersSearch.filtersLabel}:</span>
          {(['main', 'primary', 'side', 'appears'] as const satisfies readonly CharacterRole[]).map((r) => (
            <Link
              key={r}
              href={characterBrowseHref(params, { role: params.role === r ? null : r })}
              className={`rounded-md border px-2 py-0.5 transition-colors ${
                params.role === r
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={params.role === r}
            >
              {t.charactersSearch.role[r]}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          {(['m', 'f', 'b', 'n'] as const satisfies readonly CharacterSex[]).map((s) => (
            <Link
              key={s}
              href={characterBrowseHref(params, { sex: params.sex === s ? null : s })}
              className={`rounded-md border px-2 py-0.5 transition-colors ${
                params.sex === s
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={params.sex === s}
            >
              {t.charactersSearch.sex[s]}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          {(['a', 'b', 'ab', 'o'] as const satisfies readonly BloodType[]).map((b) => (
            <Link
              key={b}
              href={characterBrowseHref(params, { blood: params.blood === b ? null : b })}
              className={`rounded-md border px-2 py-0.5 uppercase transition-colors ${
                params.blood === b
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={params.blood === b}
            >
              {b}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          <Link
            href={characterBrowseHref(params, { hasImage: params.hasImage === true ? null : true })}
            className={`rounded-md border px-2 py-0.5 transition-colors ${
              params.hasImage === true
                ? 'border-accent bg-accent/15 text-accent font-bold'
                : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
            }`}
          >
            img+
          </Link>
          <Link
            href={characterBrowseHref(params, { hasVoice: params.hasVoice === true ? null : true })}
            className={`rounded-md border px-2 py-0.5 transition-colors ${
              params.hasVoice === true
                ? 'border-accent bg-accent/15 text-accent font-bold'
                : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
            }`}
          >
            voice+
          </Link>
          {(params.role || params.sex || params.blood || params.vaLang || params.hasVoice != null || params.hasImage != null) && (
            <Link
              href={characterBrowseHref(params, {
                role: null,
                sex: null,
                blood: null,
                vaLang: null,
                hasVoice: null,
                hasImage: null,
              })}
              className="rounded-md border border-status-dropped/40 bg-status-dropped/10 px-2 py-0.5 text-status-dropped hover:bg-status-dropped/20"
              aria-label={t.charactersSearch.resetFilters}
            >
              <X className="inline h-3 w-3" aria-hidden /> {t.charactersSearch.resetFilters}
            </Link>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">sort:</span>
          {(['name', 'height', 'age', 'birthday'] as const satisfies readonly CharacterSort[]).map((s) => (
            <Link
              key={s}
              href={characterBrowseHref(params, { sort: s === 'name' ? null : s })}
              className={`rounded-md border px-2 py-0.5 transition-colors ${
                params.sort === s
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {s}
            </Link>
          ))}
          <Link
            href={characterBrowseHref(params, { reverse: params.reverse ? null : true })}
            className={`rounded-md border px-2 py-0.5 transition-colors ${
              params.reverse
                ? 'border-accent bg-accent/15 text-accent font-bold'
                : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
            }`}
          >
            rev
          </Link>
          <span className="ml-2 text-muted">group:</span>
          {(['', 'blood', 'birthMonth', 'sex', 'role'] as const satisfies readonly CharacterGroupBy[]).map((g) => (
            <Link
              key={g || 'none'}
              href={characterBrowseHref(params, { groupBy: g || null })}
              className={`rounded-md border px-2 py-0.5 transition-colors ${
                params.groupBy === g
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {g || '—'}
            </Link>
          ))}
        </div>
      </header>

      {query.length === 0 ? (
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
