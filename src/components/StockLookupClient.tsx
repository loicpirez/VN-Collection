'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, ShoppingBag } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';
import { SafeImage } from './SafeImage';
import { StockPanel } from './StockPanel';

interface SearchHit {
  id: string;
  title: string;
  released: string | null;
  image: { url: string; thumbnail: string } | null;
}

export function StockLookupClient({ initialVnId }: { initialVnId: string | null }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      return undefined;
    }
    const ctrl = new AbortController();
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = (await r.json()) as { results?: SearchHit[] };
        setHits((data.results ?? []).slice(0, 12));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, t.common.error]);

  useEffect(() => {
    if (!initialVnId) { setResolvedTitle(null); return; }
    setResolvedTitle(null);
    const ctrl = new AbortController();
    fetch(`/api/vn/${encodeURIComponent(initialVnId)}`, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { vn?: { title?: string } } | null) => {
        if (data?.vn?.title) setResolvedTitle(data.vn.title);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [initialVnId]);

  const selected = useMemo(() => hits.find((hit) => hit.id === initialVnId) ?? null, [hits, initialVnId]);

  return (
    <main className="page-space mx-auto max-w-screen-2xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-xl font-bold">
            <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
            {t.stock.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-muted">{t.stock.pageSubtitle}</p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted" htmlFor="stock-vn-search">
          {t.stock.searchLabel}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="stock-vn-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.stock.searchPlaceholder}
            aria-label={t.stock.searchLabel}
            className="w-full rounded-lg border border-border bg-bg-elev py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        {error && <p className="mt-2 text-sm text-status-dropped">{error}</p>}
        {loading && <p className="mt-2 text-sm text-muted">{t.common.loading}</p>}
        {hits.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hits.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={`/stock?vn=${encodeURIComponent(hit.id)}`}
                  className={`flex min-h-[72px] items-center gap-3 rounded-lg border p-2 transition-colors ${
                    hit.id === initialVnId ? 'border-accent bg-accent/10' : 'border-border bg-bg-elev/40 hover:border-accent'
                  }`}
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded border border-border bg-bg">
                    <SafeImage
                      src={hit.image?.thumbnail ?? hit.image?.url ?? null}
                      alt={hit.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{hit.title}</span>
                    <span className="block text-[11px] text-muted">{hit.id}{hit.released ? ` - ${hit.released}` : ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {initialVnId ? (
        <div className="mt-5">
          <StockPanel vnId={initialVnId} title={selected?.title ?? resolvedTitle ?? undefined} />
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-bg-card p-6 text-sm text-muted">
          {t.stock.pickVn}
        </div>
      )}
    </main>
  );
}
