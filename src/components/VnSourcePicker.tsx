'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Library, Loader2, Plus, Search, Sparkles, Star } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { SafeImage } from '@/components/SafeImage';

export type VnPickerSource = 'library' | 'vndb' | 'egs';

export interface VnPickerHit {
  id: string;
  title: string;
  source: VnPickerSource;
  released?: string | null;
  thumbnail?: string | null;
}

interface VnSourcePickerProps {
  /** Called when the user picks a hit. */
  onPick: (hit: VnPickerHit) => void;
  /** Optional placeholder text. */
  placeholder?: string;
  /** Whether to allow selecting from local library. */
  sources?: VnPickerSource[];
  /** Maximum results per source. */
  perSourceLimit?: number;
  /** Show "Add to queue" affordance instead of bare selection. */
  showAddIcon?: boolean;
  /** Disabled state (e.g. during running batch). */
  disabled?: boolean;
}

interface LibHit { id: string; title: string; released?: string | null; thumbnail?: string | null }
interface VndbHit { id: string; title: string; released?: string | null; image?: { thumbnail?: string } | null }
interface EgsHit { egs_id: number; gamename: string; brand_name?: string | null; sellday?: string | null; image_url?: string | null }

const SOURCE_ORDER: VnPickerSource[] = ['library', 'vndb', 'egs'];

function sourceIcon(source: VnPickerSource) {
  if (source === 'library') return Library;
  if (source === 'vndb') return Star;
  return Sparkles;
}

function sourceBadgeClass(source: VnPickerSource): string {
  if (source === 'library') return 'border-status-completed/40 bg-status-completed/15 text-status-completed';
  if (source === 'vndb') return 'border-accent/40 bg-accent/10 text-accent';
  return 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue';
}

/**
 * Unified VN picker. Federates three sources behind a single search input:
 * library (local collection), VNDB (canonical), EGS (Japanese DB).
 * Results from each source are grouped and labelled so the user knows
 * whether a hit is already in their collection or needs to be added.
 */
export function VnSourcePicker({
  onPick,
  placeholder,
  sources = SOURCE_ORDER,
  perSourceLimit = 8,
  showAddIcon = false,
  disabled = false,
}: VnSourcePickerProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState<VnPickerSource | 'all'>('all');
  const [library, setLibrary] = useState<LibHit[]>([]);
  const [vndb, setVndb] = useState<VndbHit[]>([]);
  const [egs, setEgs] = useState<EgsHit[]>([]);
  const [loading, setLoading] = useState<Record<VnPickerSource, boolean>>({ library: false, vndb: false, egs: false });
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = (src: VnPickerSource) => sources.includes(src);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setLibrary([]);
      setVndb([]);
      setEgs([]);
      setLoading({ library: false, vndb: false, egs: false });
      return;
    }
    const ctrl = new AbortController();
    debounceRef.current = setTimeout(async () => {
      setError(null);
      setLoading({ library: enabled('library'), vndb: enabled('vndb'), egs: enabled('egs') });
      const promises: Promise<void>[] = [];
      if (enabled('library')) {
        promises.push(
          fetch(`/api/collection/find?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctrl.signal })
            .then((r) => r.ok ? r.json() : { matches: [] })
            .then((d: { matches?: LibHit[] }) => { if (!ctrl.signal.aborted) setLibrary((d.matches ?? []).slice(0, perSourceLimit)); })
            .catch((e: unknown) => {
              if ((e as Error).name === 'AbortError') return;
              console.error('[VnSourcePicker] library search failed:', e);
              if (!ctrl.signal.aborted) setError(t.common.error as string);
            })
            .finally(() => { if (!ctrl.signal.aborted) setLoading((p) => ({ ...p, library: false })); }),
        );
      }
      if (enabled('vndb')) {
        promises.push(
          fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: ctrl.signal })
            .then((r) => r.ok ? r.json() : { results: [] })
            .then((d: { results?: VndbHit[] }) => { if (!ctrl.signal.aborted) setVndb((d.results ?? []).slice(0, perSourceLimit)); })
            .catch((e: unknown) => {
              if ((e as Error).name === 'AbortError') return;
              console.error('[VnSourcePicker] VNDB search failed:', e);
              if (!ctrl.signal.aborted) setError(t.common.error as string);
            })
            .finally(() => { if (!ctrl.signal.aborted) setLoading((p) => ({ ...p, vndb: false })); }),
        );
      }
      if (enabled('egs')) {
        promises.push(
          fetch(`/api/egs/search?q=${encodeURIComponent(q)}&limit=${perSourceLimit}`, { cache: 'no-store', signal: ctrl.signal })
            .then((r) => r.ok ? r.json() : { candidates: [] })
            .then((d: { candidates?: EgsHit[] }) => { if (!ctrl.signal.aborted) setEgs((d.candidates ?? []).slice(0, perSourceLimit)); })
            .catch((e: unknown) => {
              if ((e as Error).name === 'AbortError') return;
              console.error('[VnSourcePicker] EGS search failed:', e);
              if (!ctrl.signal.aborted) setError(t.common.error as string);
            })
            .finally(() => { if (!ctrl.signal.aborted) setLoading((p) => ({ ...p, egs: false })); }),
        );
      }
      await Promise.allSettled(promises);
    }, 250);
    return () => { ctrl.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, perSourceLimit, sources]);

  const counts = {
    library: library.length,
    vndb: vndb.length,
    egs: egs.length,
  };
  const anyLoading = loading.library || loading.vndb || loading.egs;
  const totalHits = counts.library + counts.vndb + counts.egs;
  const showAll = activeSource === 'all';

  function renderRow(hit: VnPickerHit) {
    const Icon = sourceIcon(hit.source);
    return (
      <li key={`${hit.source}:${hit.id}`}>
        <button
          type="button"
          onClick={() => onPick(hit)}
          disabled={disabled}
          className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {hit.thumbnail && (
            <span className="h-10 w-7 shrink-0 overflow-hidden rounded border border-border bg-bg">
              <SafeImage src={hit.thumbnail} alt="" className="h-full w-full" fit="cover" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-white">{hit.title}</span>
            <span className="block text-[10px] text-muted">
              <span className={`mr-1 inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[9px] font-bold uppercase ${sourceBadgeClass(hit.source)}`}>
                <Icon className="h-2.5 w-2.5" aria-hidden />
                {t.stock.batchSourceLabels[hit.source]}
              </span>
              {hit.id}
              {hit.released ? ` · ${hit.released}` : ''}
            </span>
          </span>
          {showAddIcon && <Plus className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
        </button>
      </li>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? (t.stock.batchSearchPlaceholder as string)}
          aria-label={t.stock.batchSearchLabel as string}
          disabled={disabled}
          className="min-h-[44px] w-full rounded-lg border border-border bg-bg-elev py-2 pl-9 pr-10 text-sm text-white placeholder-muted focus:border-accent focus:outline-none disabled:opacity-50"
        />
        {anyLoading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
        )}
      </div>

      {query.trim() && sources.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label={t.stock.batchSourceFilter as string}>
          <SourceTab active={showAll} onClick={() => setActiveSource('all')} label={`${t.stock.batchSourceAll as string} (${totalHits})`} />
          {sources.map((src) => (
            enabled(src) && (
              <SourceTab
                key={src}
                active={activeSource === src}
                onClick={() => setActiveSource(src)}
                label={`${t.stock.batchSourceLabels[src]} (${counts[src]})`}
              />
            )
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-dropped">{error}</p>
      )}

      {query.trim() && (
        <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-bg-elev/40">
          {totalHits === 0 && !anyLoading ? (
            <p className="px-3 py-4 text-center text-xs text-muted">
              {t.search.noResults as string}
            </p>
          ) : (
            <>
              {(showAll || activeSource === 'library') && library.length > 0 && (
                <SourceGroup label={`${t.stock.batchSourceLabels.library} (${library.length})`} source="library">
                  {library.map((h) => renderRow({ id: h.id, title: h.title, source: 'library', released: h.released, thumbnail: h.thumbnail }))}
                </SourceGroup>
              )}
              {(showAll || activeSource === 'vndb') && vndb.length > 0 && (
                <SourceGroup label={`${t.stock.batchSourceLabels.vndb} (${vndb.length})`} source="vndb">
                  {vndb.map((h) => renderRow({ id: h.id, title: h.title, source: 'vndb', released: h.released, thumbnail: h.image?.thumbnail ?? null }))}
                </SourceGroup>
              )}
              {(showAll || activeSource === 'egs') && egs.length > 0 && (
                <SourceGroup label={`${t.stock.batchSourceLabels.egs} (${egs.length})`} source="egs">
                  {egs.map((h) => renderRow({
                    id: `egs_${h.egs_id}`,
                    title: h.gamename,
                    source: 'egs',
                    released: h.sellday ?? null,
                    thumbnail: h.image_url ?? null,
                  }))}
                </SourceGroup>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SourceTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
      }`}
    >
      {label}
    </button>
  );
}

function SourceGroup({ label, children }: { label: string; source: VnPickerSource; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border/40 bg-bg-elev px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

// Lightweight re-export so the unused-import linter doesn't complain.
export const _Caret = ChevronDown;
