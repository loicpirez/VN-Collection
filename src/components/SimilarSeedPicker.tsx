'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useDebouncedCallback } from '@/lib/hooks';
import { SafeImage } from '@/components/SafeImage';
import { decodeCollectionFindMatches } from '@/lib/collection-find-client-shape';
import { decodeVndbSearchResults } from '@/lib/search-client-shape';

interface VnHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  developer: string | null;
  image: { url: string; thumbnail: string; sexual?: number | null } | null;
  inCollection: boolean;
}

export interface SimilarSeedData {
  id: string;
  title: string;
  alttitle?: string | null;
  image?: { url: string; thumbnail: string; sexual?: number | null } | null;
}

/**
 * In-page VN seed picker for /similar.
 *
 * Two rendering modes:
 *   - Chip mode (currentSeed set, not editing): shows the current seed VN
 *     with a "Change" button and a clear button.
 *   - Search mode (no seed, or "Change" clicked): shows a debounced combobox
 *     that searches local collection + VNDB in parallel.
 *
 * Selecting a VN navigates to `/similar?vn=<id>` (full page re-render so
 * the server fetches results for the new seed).
 */
export function SimilarSeedPicker({
  currentSeed,
  autoFocus,
}: {
  currentSeed?: SimilarSeedData | null;
  autoFocus?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const inputId = useId();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<VnHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [editing, setEditing] = useState(!currentSeed);
  const lastQueryRef = useRef('');
  const searchAbortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seedId = currentSeed?.id ?? null;

  useEffect(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    lastQueryRef.current = '';
    setQuery('');
    setHits([]);
    setSearching(false);
    setOpen(false);
    setHighlight(0);
    setEditing(!currentSeed);
  }, [seedId]);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      searchAbortRef.current?.abort();
      setHits([]);
      setSearching(false);
      return;
    }
    lastQueryRef.current = trimmed;
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearching(true);

    const [localRes, vndbRes] = await Promise.allSettled([
      fetch(`/api/collection/find?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d) => decodeCollectionFindMatches(d) ?? []),
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => decodeVndbSearchResults(d) ?? []),
    ]);

    if (ac.signal.aborted || lastQueryRef.current !== trimmed) return;
    setSearching(false);

    const localRows = localRes.status === 'fulfilled' ? localRes.value : [];
    const vndbRows = vndbRes.status === 'fulfilled' ? vndbRes.value : [];

    const localHits: VnHit[] = localRows.map((r) => {
      const localThumb = r.local_image_thumb || r.local_image || null;
      const remoteThumb = r.image_thumb || r.image_url || null;
      const url = localThumb ? `/api/files/${localThumb}` : remoteThumb;
      return {
        id: r.id,
        title: r.title,
        alttitle: r.alttitle,
        released: null,
        developer: null,
        image: url ? { url, thumbnail: url, sexual: r.image_sexual ?? null } : null,
        inCollection: true,
      };
    });

    const localIds = new Set(localHits.map((h) => h.id));
    const vndbHits: VnHit[] = vndbRows
      .filter((r) => !localIds.has(r.id))
      .map((r) => ({
        id: r.id,
        title: r.title,
        alttitle: r.alttitle,
        released: r.released,
        developer: r.developers?.[0]?.name ?? null,
        image: r.image ?? null,
        inCollection: r.in_collection ?? false,
      }));

    setHits([...localHits, ...vndbHits]);
  }, []);

  const debouncedSearch = useDebouncedCallback((q: string) => void search(q), 300);

  useEffect(() => {
    debouncedSearch(query);
    return () => {
      searchAbortRef.current?.abort();
    };
  }, [query, debouncedSearch]);

  useEffect(() => {
    setHighlight(0);
  }, [hits]);

  useEffect(() => {
    if ((autoFocus || !currentSeed) && editing) inputRef.current?.focus();
  }, [autoFocus, currentSeed, editing]);

  function select(id: string) {
    setOpen(false);
    setQuery('');
    setHits([]);
    setEditing(false);
    router.push(`/similar?vn=${encodeURIComponent(id)}`);
  }

  function clear() {
    setEditing(true);
    router.push('/similar');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (hits[highlight]) {
        e.preventDefault();
        select(hits[highlight].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="mt-4 w-full">
      {!editing && currentSeed && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-elev/40 p-2">
          <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
            <SafeImage
              src={currentSeed.image?.thumbnail || currentSeed.image?.url || null}
              sexual={currentSeed.image?.sexual ?? null}
              alt={currentSeed.title}
              className="h-12 w-8 rounded"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-semibold" title={currentSeed.title}>{currentSeed.title}</p>
            {currentSeed.alttitle && currentSeed.alttitle !== currentSeed.title && (
              <p className="line-clamp-1 text-[11px] text-muted" title={currentSeed.alttitle}>{currentSeed.alttitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-white"
          >
            <Pencil className="h-3 w-3" aria-hidden /> {t.similar.changeSeed}
          </button>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center rounded-md border border-border bg-bg-card p-1 text-muted hover:border-status-dropped hover:text-status-dropped"
            aria-label={t.recommend.seedPicker.clear}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}

      {editing && (
        <div className="relative w-full">
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            {t.similar.pickSeedLabel}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              inputMode="search"
              role="combobox"
              aria-expanded={open && hits.length > 0}
              aria-autocomplete="list"
              aria-controls={`${inputId}-list`}
              aria-label={t.similar.searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={t.similar.searchPlaceholder}
              className="input w-full pl-10 pr-8 text-sm"
            />
            {searching && (
              <Loader2
                className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted"
                aria-hidden
              />
            )}
          </div>

          {open && hits.length === 0 && query.trim().length > 0 && !searching && (
            <p className="mt-2 rounded-lg border border-border bg-bg-card p-3 text-sm text-muted">
              {t.recommend.seedPicker.noResults}
            </p>
          )}

          {open && hits.length > 0 && (
            <ul
              id={`${inputId}-list`}
              role="listbox"
              className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 shadow-lg"
            >
              {hits.map((hit, idx) => {
                const active = idx === highlight;
                const year = hit.released?.slice(0, 4);
                return (
                  <li key={hit.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => select(hit.id)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                        active ? 'bg-bg-elev text-accent' : 'hover:bg-bg-elev hover:text-accent'
                      }`}
                    >
                      <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
                        <SafeImage
                          src={hit.image?.thumbnail || hit.image?.url || null}
                          sexual={hit.image?.sexual ?? null}
                          alt={hit.title}
                          className="h-12 w-8"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold" title={hit.title}>{hit.title}</p>
                        {hit.alttitle && hit.alttitle !== hit.title && (
                          <p className="line-clamp-1 text-[11px] text-muted" title={hit.alttitle}>{hit.alttitle}</p>
                        )}
                        {(year || hit.developer) && (
                          <p className="text-[11px] text-muted">
                            {[year, hit.developer].filter(Boolean).join(' / ')}
                          </p>
                        )}
                      </div>
                      {hit.inCollection && (
                        <span className="shrink-0 rounded bg-status-completed/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-completed">
                          {t.recommend.badgeInCollection}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
