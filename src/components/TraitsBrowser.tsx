'use client';
import { memo, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Library, Search, SearchX, Sparkles } from 'lucide-react'
import { RefreshScopeButton } from './RefreshScopeButton';
import { SkeletonRows } from './Skeleton';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum } from '@/lib/locale-number';
import { stripVndbMarkup } from './VndbMarkup';
import type { VndbTrait } from '@/lib/vndb-types';

import { readApiError } from '@/lib/api-error-read';

const Q_DEBOUNCE_MS = 300;

/**
 * Memoized controlled search field for the traits browser. Mirrors the
 * `WishlistSearchInput` pattern: keeps a local `draft` so a keystroke
 * re-renders only this input, debounces the committed value into URL
 * state via `onCommit`, and resyncs from `urlValue` on external clears
 * or navigation.
 */
const TraitsSearchInput = memo(function TraitsSearchInput({
  urlValue,
  placeholder,
  onCommit,
  debounceMs,
}: {
  urlValue: string;
  placeholder: string;
  onCommit: (next: string) => void;
  debounceMs: number;
}) {
  const [draft, setDraft] = useState(urlValue);
  useEffect(() => {
    setDraft(urlValue);
  }, [urlValue]);
  useEffect(() => {
    if (draft === urlValue) return;
    const handle = setTimeout(() => onCommit(draft.trim()), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, urlValue, onCommit, debounceMs]);
  return (
    <div className="relative flex-1 min-w-[160px] sm:min-w-[200px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        className="input pl-9"
        aria-label={placeholder}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
});

export function TraitsBrowser({ lastUpdatedAt = null }: { lastUpdatedAt?: number | null } = {}) {
  const t = useT();
  const locale = useLocale();
  const search = useSearchParams();
  const router = useRouter();
  const q = search?.get('q') ?? '';
  const onlyMine = search?.get('mine') === '1';
  const [results, setResults] = useState<VndbTrait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(search?.toString() ?? '');
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(`/traits${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, search],
  );

  const commitSearch = useCallback((next: string) => setParam('q', next || null), [setParam]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const url = onlyMine
          ? '/api/collection/traits'
          : `/api/traits?${new URLSearchParams({ q, results: '60' })}`;
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const d = await r.json();
        let list: VndbTrait[] = d.traits;
        if (onlyMine && q.trim()) {
          const lower = q.trim().toLowerCase();
          list = list.filter((tr) =>
            tr.name.toLowerCase().includes(lower) ||
            (tr.group_name?.toLowerCase().includes(lower) ?? false) ||
            tr.aliases.some((a) => a.toLowerCase().includes(lower)),
          );
        }
        if (alive) setResults(list);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }, 0);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, onlyMine, t.common.error]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <Sparkles className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.traits.pageTitle}</h1>
          <p className="text-sm text-muted">{t.traits.pageSubtitle}</p>
        </div>
        <RefreshScopeButton scope="traits-list" lastUpdatedAt={lastUpdatedAt} />
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <TraitsSearchInput
          urlValue={q}
          placeholder={t.traits.searchPlaceholder}
          onCommit={commitSearch}
          debounceMs={Q_DEBOUNCE_MS}
        />
        <button
          type="button"
          onClick={() => setParam('mine', onlyMine ? null : '1')}
          className={`btn ${onlyMine ? 'btn-primary' : ''}`}
          title={t.library.filterMineHint}
        >
          <Library className="h-4 w-4" />
          {t.library.filterMine}
        </button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">{error}</div>}

      {loading ? (
        <SkeletonRows count={8} withThumb={false} />
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card px-4 py-12 text-center text-muted">
          <SearchX className="mx-auto mb-3 h-8 w-8 text-muted/70" aria-hidden />
          <div className="text-sm font-bold text-white">{t.traits.emptyTitle}</div>
          <p className="mx-auto mt-1 max-w-md text-xs">{t.traits.emptyBody}</p>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {results.map((tr) => (
            <Link
              key={tr.id}
              href={`/trait/${encodeURIComponent(tr.id)}`}
              className="group block rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold transition-colors can-hover:group-hover:text-accent" title={`${tr.group_name ? `${tr.group_name} / ` : ''}${tr.name}`}>
                  {tr.group_name && <span className="text-muted">{tr.group_name} / </span>}
                  {tr.name}
                </h3>
                {tr.sexual && (
                  <span className="shrink-0 rounded-md bg-status-dropped/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-dropped">
                    R18
                  </span>
                )}
              </div>
              {tr.description && (
                <p className="mt-1 line-clamp-3 text-xs text-muted">{stripVndbMarkup(tr.description)}</p>
              )}
              <div className="mt-2 text-[11px] text-muted tabular-nums">
                {fmtNum(tr.char_count, locale)} {t.traits.charCount}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
