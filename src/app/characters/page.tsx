import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserSquare, X } from 'lucide-react';
import { searchCharacters } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { parseCharacterSearchParams } from '@/lib/char-staff-search-filters';

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
 * Lightweight VNDB-wide character search. Auto-paginates the first 60
 * results from `POST /character` filtered by `search=` and renders
 * them as a card grid. Long missing piece — until now characters
 * could only be found via the per-VN cast block or the navbar modal.
 */
export default async function CharactersPage({ searchParams }: PageProps) {
  const t = await getDict();
  const sp = await searchParams;
  const parsed = parseCharacterSearchParams(sp);
  const includeEro = sp.ero === '1';
  const query = parsed.q;
  const { tab, role, sex, vn } = parsed;
  // VNDB-tab search; the local tab is currently surfaced as a chip
  // toggle that lands the operator on the cached-character-only
  // results once that view ships. For now the Local tab simply
  // forwards to VNDB to keep the page useful while the local index
  // is wired up.
  const allResults = query
    ? await searchCharacters(query, { results: 60 }).catch(() => [])
    : [];
  // Client-side post-filter — VNDB's filter syntax for `/character`
  // is rich but each new predicate triples query latency; for the
  // typical 60-row result the filter is fast in JS.
  const filteredByCriteria = allResults.filter((c) => {
    if (role) {
      const hit = (c.vns ?? []).some((v) => v.role === role);
      if (!hit) return false;
    }
    if (sex) {
      const main = c.sex?.[0];
      if (main !== sex) return false;
    }
    if (vn) {
      const hit = (c.vns ?? []).some((v) => v.id.toLowerCase() === vn);
      if (!hit) return false;
    }
    return true;
  });
  const visible = includeEro
    ? filteredByCriteria
    : filteredByCriteria.filter((c) => !((c.image?.sexual ?? 0) >= 1.5));

  function chipHref(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (includeEro) params.set('ero', '1');
    if (tab === 'vndb' && !('tab' in overrides)) params.set('tab', 'vndb');
    if (role && !('role' in overrides)) params.set('role', role);
    if (sex && !('sex' in overrides)) params.set('sex', sex);
    if (vn && !('vn' in overrides)) params.set('vn', vn);
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/characters?${qs}` : '/characters';
  }

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
          {/* Preserve filter state when re-submitting via the input.
              Hidden inputs keep tab/role/sex/vn alive across query
              changes — the operator can refine the query without
              losing their filter context. */}
          {tab === 'vndb' && <input type="hidden" name="tab" value="vndb" />}
          {role && <input type="hidden" name="role" value={role} />}
          {sex && <input type="hidden" name="sex" value={sex} />}
          {vn && <input type="hidden" name="vn" value={vn} />}
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
          <Link
            href={chipHref({ tab: null })}
            role="tab"
            aria-selected={tab === 'local'}
            className={`rounded px-2.5 py-1 ${tab === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.charactersSearch.tabLocal}
          </Link>
          <Link
            href={chipHref({ tab: 'vndb' })}
            role="tab"
            aria-selected={tab === 'vndb'}
            className={`rounded px-2.5 py-1 ${tab === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
          >
            {t.charactersSearch.tabVndb}
          </Link>
        </nav>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted">{t.charactersSearch.filtersLabel}:</span>
          {(['main', 'primary', 'side', 'appears'] as const).map((r) => (
            <Link
              key={r}
              href={chipHref({ role: role === r ? null : r })}
              className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 transition-colors ${
                role === r
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={role === r}
            >
              {t.charactersSearch.role[r]}
            </Link>
          ))}
          <span className="text-muted/60">·</span>
          {(['m', 'f', 'b', 'n'] as const).map((s) => (
            <Link
              key={s}
              href={chipHref({ sex: sex === s ? null : s })}
              className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 transition-colors ${
                sex === s
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              aria-pressed={sex === s}
            >
              {t.charactersSearch.sex[s]}
            </Link>
          ))}
          {(role || sex || vn) && (
            <Link
              href={chipHref({ role: null, sex: null, vn: null })}
              className="inline-flex items-center gap-0.5 rounded-md border border-status-dropped/40 bg-status-dropped/10 px-2 py-0.5 text-status-dropped hover:bg-status-dropped/20"
              aria-label={t.charactersSearch.resetFilters}
            >
              <X className="h-3 w-3" aria-hidden /> {t.charactersSearch.resetFilters}
            </Link>
          )}
        </div>
      </header>

      {query.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.charactersSearch.idleHint}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-card p-4 text-sm text-muted sm:p-6">
          {t.charactersSearch.empty}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {visible.length} {t.charactersSearch.resultsCount}
          </p>
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            {visible.map((c) => (
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
                  {c.aliases && c.aliases.length > 0 && (
                    <p className="line-clamp-1 text-[10px] text-muted/70">
                      {t.common.aka} {c.aliases.slice(0, 2).join(' · ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
