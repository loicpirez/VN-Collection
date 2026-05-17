'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Pencil, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { clearSeed, setSeed } from '@/lib/seed-picker-url';
import { SafeImage } from '@/components/SafeImage';

/** Hit shape both autocomplete sources are normalised to. */
interface VnHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  developer: string | null;
  image: { url: string; thumbnail: string; sexual?: number | null } | null;
  inCollection: boolean;
  /** "local" rows come from the in-collection finder; "vndb" rows come from /api/search. */
  source: 'local' | 'vndb';
}

/** Optional pre-seeded chip data so the picker can render a chip on first paint without a round-trip. */
export interface SeedChipData {
  id: string;
  title: string;
  alttitle?: string | null;
  released?: string | null;
  developer?: string | null;
  image?: { url: string; thumbnail: string; sexual?: number | null } | null;
}

/**
 * In-app picker for the `?seed=` URL slot on /recommendations
 * (`mode=similar-to-vn`). Replaces the previous "edit the URL by
 * hand" guidance with a real combobox:
 *
 *   1. The chip strip shows the current seed (cover + title + Change +
 *      Clear) whenever `?seed=` is set; otherwise we go straight to the
 *      search input.
 *   2. The search input does a debounced (300 ms) lookup that hits BOTH
 *      `GET /api/collection/find?q=` (local) and `GET /api/search?q=`
 *      (VNDB-wide) in parallel. Local rows render first so the picker
 *      feels instantaneous while the upstream VNDB call settles.
 *   3. Keyboard navigation: ArrowUp/ArrowDown moves the highlighted row,
 *      Enter selects, Escape closes the dropdown without changing the
 *      URL.
 *   4. Selecting a row calls `router.replace` with the merged URL params
 *      (`scroll: false`), so the page re-renders the results panel
 *      under the new seed without losing the scroll position.
 *
 * The picker never owns the seed state — `?seed=` is the single source
 * of truth. This keeps deep-links shareable and lets the server-side
 * page render a stable initial HTML pass.
 */
export function VnSeedPicker({
  initialSeed,
  invalid,
  autoFocusInput,
}: {
  /** Optional pre-resolved chip data for the current seed VN. */
  initialSeed?: SeedChipData | null;
  /** When true, render the seed chip in an error state (VN not found, etc.). */
  invalid?: boolean;
  /** Auto-focus the input when the picker first mounts. */
  autoFocusInput?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<VnHit[]>([]);
  const [searchingLocal, setSearchingLocal] = useState(false);
  const [searchingVndb, setSearchingVndb] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [editing, setEditing] = useState(!initialSeed);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastQueryRef = useRef<string>('');

  const seedId = searchParams.get('seed');
  const showChip = !!initialSeed && !editing;

  // Reset the editing flag when the URL seed changes from outside
  // (e.g. another tab, a Link click). Without this, switching back to
  // a known seed would keep the picker open on the search input.
  useEffect(() => {
    if (initialSeed && !editing) return;
    if (!initialSeed) setEditing(true);
  }, [initialSeed, editing]);

  /** Hit the two endpoints in parallel; render local rows the moment they land. */
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setHits([]);
      setSearchingLocal(false);
      setSearchingVndb(false);
      return;
    }
    lastQueryRef.current = trimmed;
    setSearchingLocal(true);
    setSearchingVndb(true);
    const localPromise = fetch(`/api/collection/find?q=${encodeURIComponent(trimmed)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((d) => (d.matches as Array<{ id: string; title: string; alttitle: string | null }>) ?? [])
      .catch(() => [] as Array<{ id: string; title: string; alttitle: string | null }>)
      .finally(() => {
        if (lastQueryRef.current === trimmed) setSearchingLocal(false);
      });
    const vndbPromise = fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then(
        (d) =>
          (d.results as Array<{
            id: string;
            title: string;
            alttitle: string | null;
            released: string | null;
            image: { url: string; thumbnail: string; sexual?: number | null } | null;
            developers?: { name: string }[];
            in_collection?: boolean;
          }>) ?? [],
      )
      .catch(() => [])
      .finally(() => {
        if (lastQueryRef.current === trimmed) setSearchingVndb(false);
      });
    // Race local in first so the UI flickers minimally.
    const localRows = await localPromise;
    if (lastQueryRef.current !== trimmed) return;
    const localHits: VnHit[] = localRows.map((row) => ({
      id: row.id,
      title: row.title,
      alttitle: row.alttitle,
      released: null,
      developer: null,
      image: null,
      inCollection: true,
      source: 'local' as const,
    }));
    setHits(localHits);
    const vndbRows = await vndbPromise;
    if (lastQueryRef.current !== trimmed) return;
    const localIds = new Set(localRows.map((r) => r.id));
    const vndbHits: VnHit[] = vndbRows
      .filter((row) => !localIds.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        alttitle: row.alttitle,
        released: row.released,
        developer: row.developers?.[0]?.name ?? null,
        image: row.image,
        inCollection: row.in_collection ?? false,
        source: 'vndb' as const,
      }));
    setHits([...localHits, ...vndbHits]);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    if (autoFocusInput && editing) inputRef.current?.focus();
  }, [autoFocusInput, editing]);

  // Reset the keyboard highlight whenever the hit list mutates so
  // ArrowDown lands on a real row instead of an index that no longer
  // exists.
  useEffect(() => {
    setHighlight(0);
  }, [hits]);

  const navigateTo = useCallback(
    (nextParams: URLSearchParams) => {
      const qs = nextParams.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : '?', { scroll: false });
      });
    },
    [router],
  );

  const selectVn = useCallback(
    (vnId: string) => {
      const nextParams = setSeed(searchParams, vnId);
      setOpen(false);
      setQuery('');
      setHits([]);
      setEditing(false);
      navigateTo(nextParams);
    },
    [navigateTo, searchParams],
  );

  const clearCurrentSeed = useCallback(() => {
    const nextParams = clearSeed(searchParams);
    setEditing(true);
    navigateTo(nextParams);
  }, [navigateTo, searchParams]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
          selectVn(hits[highlight].id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [hits, highlight, selectVn],
  );

  const totalLoading = searchingLocal || searchingVndb;
  const searchingLabel = useMemo(() => {
    if (searchingLocal && searchingVndb) {
      return `${t.recommend.seedPicker.searchingLocal} · ${t.recommend.seedPicker.searchingVndb}`;
    }
    if (searchingLocal) return t.recommend.seedPicker.searchingLocal;
    if (searchingVndb) return t.recommend.seedPicker.searchingVndb;
    return null;
  }, [searchingLocal, searchingVndb, t]);

  return (
    <div
      className={isPending ? 'w-full transition-opacity duration-200 opacity-60' : 'w-full transition-opacity duration-200'}
      aria-busy={isPending || undefined}
      data-testid="vn-seed-picker"
    >
      {showChip && initialSeed && (
        <div
          className={
            'mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2 ' +
            (invalid
              ? 'border-status-dropped/50 bg-status-dropped/10'
              : 'border-border bg-bg-elev/40')
          }
          data-testid="vn-seed-chip"
          data-seed-id={initialSeed.id}
        >
          <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
            <SafeImage
              src={initialSeed.image?.thumbnail || initialSeed.image?.url || null}
              sexual={initialSeed.image?.sexual ?? null}
              alt={initialSeed.title}
              className="h-12 w-8 rounded"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-semibold">
              <span title={initialSeed.id}>{initialSeed.title}</span>
            </p>
            {initialSeed.alttitle && initialSeed.alttitle !== initialSeed.title && (
              <p className="line-clamp-1 text-[11px] text-muted">{initialSeed.alttitle}</p>
            )}
            {invalid && (
              <p className="text-[11px] text-status-dropped">
                {t.recommend.seedPicker.invalidSeed}
              </p>
            )}
            {!invalid && (
              <p className="text-[11px] text-muted">
                {t.recommend.seedPicker.currentSeed}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-white"
            data-testid="vn-seed-change"
          >
            <Pencil className="h-3 w-3" aria-hidden /> {t.recommend.seedPicker.change}
          </button>
          <button
            type="button"
            onClick={clearCurrentSeed}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
            aria-label={t.recommend.seedPicker.clear}
            data-testid="vn-seed-clear"
          >
            <X className="h-3 w-3" aria-hidden /> {t.recommend.seedPicker.clear}
          </button>
        </div>
      )}
      {/* When the seed is invalid we still render the chip above PLUS the search input
          so the operator can immediately replace the broken id. */}
      {(editing || invalid) && (
        <div className="relative w-full">
          {/* Visible label so the input is announced by screen readers and
              testable via `aria-label` / matching `<label for>`. */}
          <label
            htmlFor={inputId}
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            {t.recommend.seedPicker.label}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={open && hits.length > 0}
              aria-autocomplete="list"
              aria-controls={`${inputId}-listbox`}
              aria-label={t.recommend.seedPicker.ariaLabel}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={t.recommend.seedPicker.placeholder}
              className="input w-full pl-7 pr-7 text-sm"
            />
            {totalLoading && (
              <Loader2
                className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted"
                aria-label={searchingLabel ?? undefined}
              />
            )}
          </div>
          {open && hits.length === 0 && query.trim().length > 0 && !totalLoading && (
            <p className="mt-2 rounded-md border border-border bg-bg-card p-2 text-[11px] text-muted">
              {t.recommend.seedPicker.noResults}
            </p>
          )}
          {open && hits.length > 0 && (
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border bg-bg-card p-1"
            >
              {hits.map((hit, idx) => {
                const active = idx === highlight;
                const year = hit.released?.slice(0, 4);
                return (
                  <li key={`${hit.source}:${hit.id}`} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => selectVn(hit.id)}
                      onMouseEnter={() => setHighlight(idx)}
                      title={hit.id}
                      className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left ${
                        active ? 'bg-bg-elev text-accent' : 'hover:bg-bg-elev hover:text-accent'
                      }`}
                    >
                      <div className="relative h-9 w-6 shrink-0 overflow-hidden rounded">
                        <SafeImage
                          src={hit.image?.thumbnail || hit.image?.url || null}
                          sexual={hit.image?.sexual ?? null}
                          alt={hit.title}
                          className="h-9 w-6 rounded"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-[12px] font-semibold">{hit.title}</p>
                        {hit.alttitle && hit.alttitle !== hit.title && (
                          <p className="line-clamp-1 text-[10px] text-muted">{hit.alttitle}</p>
                        )}
                        <p className="line-clamp-1 text-[10px] text-muted">
                          {[year, hit.developer].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {hit.inCollection && (
                        <span className="rounded bg-status-completed/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-completed">
                          {t.recommend.badgeInCollection}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Visually hidden when no seed; used purely for the screen-reader
              announcement so the input never claims to control a stale id. */}
          {seedId && !initialSeed && !invalid && (
            <p className="mt-1 text-[10px] text-muted" aria-live="polite">
              {t.recommend.seedPicker.currentSeed}: <code>{seedId}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
