'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitCompare, Loader2, Plus, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { SafeImage } from '@/components/SafeImage';

interface VnHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  developer: string | null;
  image: { url: string; thumbnail: string; sexual?: number | null } | null;
  inCollection: boolean;
}

export interface CompareVn {
  id: string;
  title: string;
  alttitle: string | null;
  image: { url: string; thumbnail: string; sexual?: number | null } | null;
}

/**
 * In-page multi-VN picker for /compare.
 *
 * Accepts up to 4 VNs. Provides:
 *   - Thumbnail chips for each selected VN with an × remove button.
 *   - A "+" add slot that expands into a debounced combobox searching
 *     local collection + VNDB in parallel.
 *   - A "Compare" button that navigates to
 *     `/compare?ids=id1,id2,...` once ≥ 2 VNs are selected.
 *
 * `initialVns` is passed from the server component so the chips render
 * on first paint without a round-trip. When the URL changes (user
 * navigates), the entire tree remounts and `initialVns` reflects the
 * new server state.
 */
export function CompareVnPicker({ initialVns }: { initialVns: CompareVn[] }) {
  const t = useT();
  const router = useRouter();
  const inputId = useId();

  const [selected, setSelected] = useState<CompareVn[]>(initialVns);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<VnHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [showAdd, setShowAdd] = useState(initialVns.length < 4);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedIds = new Set(selected.map((s) => s.id));

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setHits([]);
        setSearching(false);
        return;
      }
      lastQueryRef.current = trimmed;
      setSearching(true);

      const [localRes, vndbRes] = await Promise.allSettled([
        fetch(`/api/collection/find?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { matches: [] }))
          .then(
            (d) =>
              (d.matches ?? []) as Array<{
                id: string;
                title: string;
                alttitle: string | null;
                image_url?: string | null;
                image_thumb?: string | null;
                local_image?: string | null;
                local_image_thumb?: string | null;
                image_sexual?: number | null;
              }>,
          ),
        fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then(
            (d) =>
              (d.results ?? []) as Array<{
                id: string;
                title: string;
                alttitle: string | null;
                released: string | null;
                image: { url: string; thumbnail: string; sexual?: number | null } | null;
                developers?: { name: string }[];
                in_collection?: boolean;
              }>,
          ),
      ]);

      if (lastQueryRef.current !== trimmed) return;
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

      const currentSelectedIds = new Set(selected.map((s) => s.id));
      setHits([...localHits, ...vndbHits].filter((h) => !currentSelectedIds.has(h.id)));
    },
    [selected],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    setHighlight(0);
  }, [hits]);

  useEffect(() => {
    if (showAdd) inputRef.current?.focus();
  }, [showAdd]);

  function remove(id: string) {
    setSelected((prev) => prev.filter((v) => v.id !== id));
  }

  function addHit(hit: VnHit) {
    if (selected.length >= 4) return;
    const next = [
      ...selected,
      { id: hit.id, title: hit.title, alttitle: hit.alttitle, image: hit.image },
    ];
    setSelected(next);
    setQuery('');
    setHits([]);
    setOpen(false);
    if (next.length >= 4) setShowAdd(false);
  }

  function compare() {
    if (selected.length < 2) return;
    router.push(`/compare?ids=${encodeURIComponent(selected.map((s) => s.id).join(','))}`);
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
        addHit(hits[highlight]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="mt-4">
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {selected.map((vn) => (
            <div
              key={vn.id}
              className="group relative flex items-start gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 pr-8 transition-colors hover:border-accent/50"
            >
              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded">
                <SafeImage
                  src={vn.image?.thumbnail || vn.image?.url || null}
                  sexual={vn.image?.sexual ?? null}
                  alt={vn.title}
                  className="h-16 w-11"
                />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 max-w-[140px] text-[12px] font-semibold leading-tight">
                  {vn.title}
                </p>
                {vn.alttitle && vn.alttitle !== vn.title && (
                  <p className="line-clamp-1 max-w-[140px] text-[10px] text-muted">{vn.alttitle}</p>
                )}
                <p className="mt-0.5 font-mono text-[10px] text-muted/60">{vn.id}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(vn.id)}
                aria-label={t.compareView.removeVn}
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted/40 transition-colors hover:text-status-dropped focus-visible:text-status-dropped"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}

          {selected.length < 4 && !showAdd && (
            <button
              type="button"
              onClick={() => {
                setShowAdd(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="flex h-[88px] min-w-[120px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t.compareView.addVn}
            </button>
          )}
        </div>
      )}

      {(showAdd || selected.length === 0) && selected.length < 4 && (
        <div className="relative mb-4">
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted"
          >
            {t.compareView.addVn}
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
              role="combobox"
              aria-expanded={open && hits.length > 0}
              aria-autocomplete="list"
              aria-controls={`${inputId}-list`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={t.compareWith.searchPlaceholder}
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
              className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 shadow-lg"
            >
              {hits.map((hit, idx) => {
                const active = idx === highlight;
                const year = hit.released?.slice(0, 4);
                return (
                  <li key={hit.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => addHit(hit)}
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
                        <p className="line-clamp-1 text-sm font-semibold">{hit.title}</p>
                        {hit.alttitle && hit.alttitle !== hit.title && (
                          <p className="line-clamp-1 text-[11px] text-muted">{hit.alttitle}</p>
                        )}
                        {(year || hit.developer) && (
                          <p className="text-[11px] text-muted">
                            {[year, hit.developer].filter(Boolean).join(' · ')}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={compare}
          disabled={selected.length < 2}
          className="btn btn-primary inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GitCompare className="h-4 w-4" aria-hidden />
          {t.compareView.compareNow}
        </button>
        {selected.length < 2 && (
          <p className="text-xs text-muted">{t.compareView.notEnough}</p>
        )}
        {selected.length >= 2 && showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="text-xs text-muted hover:text-white"
          >
            {t.common.cancel}
          </button>
        )}
        {!selectedIds.size && (
          <p className="text-xs text-muted">{t.compareView.subtitle}</p>
        )}
      </div>
    </div>
  );
}
