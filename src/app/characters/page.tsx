import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserSquare } from 'lucide-react';
import { searchCharacters } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; ero?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const dict = await getDict();
  const { q } = await searchParams;
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
  const { q, ero } = await searchParams;
  const includeEro = ero === '1';
  const query = (q ?? '').trim();
  const results = query
    ? await searchCharacters(query, { results: 60 }).catch(() => [])
    : [];
  const visible = includeEro
    ? results
    : results.filter((c) => !((c.image?.sexual ?? 0) >= 1.5));

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
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
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
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
                      aka {c.aliases.slice(0, 2).join(' · ')}
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
