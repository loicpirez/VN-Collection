'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp, Database, FileText, Loader2, Plus, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { SkeletonCardGrid, SkeletonRows } from './Skeleton';
import { TextualSearchPanel } from './TextualSearchPanel';
import { CardDensitySlider, cardGridColumns } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { useToast } from './ToastProvider';
import { resolveScopedDensity, useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
import type { VndbSearchHit } from '@/lib/types';

type SearchSource = 'vndb' | 'egs' | 'local';

interface EgsCandidate {
  id: number;
  gamename: string;
  median: number | null;
  count: number | null;
  sellday: string | null;
}

const COMMON_LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'fr', 'de', 'es', 'it', 'ru'];
const COMMON_PLATFORMS = ['win', 'lin', 'mac', 'ios', 'and', 'web', 'swi', 'ps4', 'ps5', 'psv', 'psp', 'xb1', 'xbs', 'n3d'];


interface AdvParams {
  langs: string[];
  platforms: string[];
  lengthMin: number | null;
  lengthMax: number | null;
  yearMin: string;
  yearMax: string;
  ratingMin: string;
  hasScreenshot: boolean;
  hasReview: boolean;
  hasAnime: boolean;
}

const DEFAULT_ADV: AdvParams = {
  langs: [],
  platforms: [],
  lengthMin: null,
  lengthMax: null,
  yearMin: '',
  yearMax: '',
  ratingMin: '',
  hasScreenshot: false,
  hasReview: false,
  hasAnime: false,
};

function readAdvFromUrl(sp: URLSearchParams): AdvParams {
  const csv = (key: string) => sp.get(key)?.split(',').filter(Boolean) ?? [];
  const num = (key: string) => {
    const v = sp.get(key);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    langs: csv('langs'),
    platforms: csv('platforms'),
    lengthMin: num('lengthMin'),
    lengthMax: num('lengthMax'),
    yearMin: sp.get('yearMin') ?? '',
    yearMax: sp.get('yearMax') ?? '',
    ratingMin: sp.get('ratingMin') ?? '',
    hasScreenshot: sp.get('hasScreenshot') === '1',
    hasReview: sp.get('hasReview') === '1',
    hasAnime: sp.get('hasAnime') === '1',
  };
}

function isAdvActive(adv: AdvParams): boolean {
  return (
    adv.langs.length > 0 ||
    adv.platforms.length > 0 ||
    adv.lengthMin !== null ||
    adv.lengthMax !== null ||
    !!adv.yearMin ||
    !!adv.yearMax ||
    !!adv.ratingMin ||
    adv.hasScreenshot ||
    adv.hasReview ||
    adv.hasAnime
  );
}

// WeakMap-cached projection so `React.memo(VnCard)` skips re-renders
// when the only thing that changed is the search query.
const searchCache = new WeakMap<VndbSearchHit, CardData>();

function searchCardData(r: VndbSearchHit): CardData {
  const cached = searchCache.get(r);
  if (cached) return cached;
  const data: CardData = {
    id: r.id,
    title: r.title,
    poster: r.image?.thumbnail || r.image?.url || null,
    released: r.released,
    rating: r.rating,
    length_minutes: r.length_minutes,
    inCollectionBadge: r.in_collection,
    developers: r.developers,
  };
  searchCache.set(r, data);
  return data;
}

export function SearchClient() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAdv = useMemo(() => readAdvFromUrl(new URLSearchParams(searchParams.toString())), [searchParams]);
  const initialQ = searchParams.get('q') ?? '';
  // URL parameter takes either `?source=` (new, canonical) or `?src=`
  // (legacy short form). Accepts vndb / egs / local; anything else
  // falls back to vndb.
  const initialSource: SearchSource = (() => {
    const raw = searchParams.get('source') ?? searchParams.get('src') ?? '';
    if (raw === 'egs') return 'egs';
    if (raw === 'local') return 'local';
    return 'vndb';
  })();

  const [source, setSource] = useState<SearchSource>(initialSource);
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<VndbSearchHit[]>([]);
  const [egsResults, setEgsResults] = useState<EgsCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(!!initialQ || isAdvActive(initialAdv));
  const [advOpen, setAdvOpen] = useState(isAdvActive(initialAdv));
  const [adv, setAdv] = useState<AdvParams>(initialAdv);
  const [addingEgsId, setAddingEgsId] = useState<number | null>(null);
  const [addedEgsIds, setAddedEgsIds] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialQ && !isAdvActive(initialAdv)) inputRef.current?.focus();
  }, [initialQ, initialAdv]);

  // Auto-run on first mount when arriving with advanced filters in the URL.
  const advAutoRunRef = useRef(false);
  useEffect(() => {
    if (advAutoRunRef.current) return;
    if (isAdvActive(initialAdv)) {
      advAutoRunRef.current = true;
      runAdvanced();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state → URL (debounced for q, immediate for adv toggles).
  const syncUrl = useCallback(
    (nextQ: string, nextAdv: AdvParams, nextSource: SearchSource) => {
      const sp = new URLSearchParams();
      if (nextQ.trim()) sp.set('q', nextQ.trim());
      // Persist the source param under the canonical `source` name
      // when the user is NOT on the default tab. Drop the legacy
      // `src=…` form on next write so URLs stay short.
      if (nextSource !== 'vndb') sp.set('source', nextSource);
      if (nextAdv.langs.length) sp.set('langs', nextAdv.langs.join(','));
      if (nextAdv.platforms.length) sp.set('platforms', nextAdv.platforms.join(','));
      if (nextAdv.lengthMin !== null) sp.set('lengthMin', String(nextAdv.lengthMin));
      if (nextAdv.lengthMax !== null) sp.set('lengthMax', String(nextAdv.lengthMax));
      if (nextAdv.yearMin) sp.set('yearMin', nextAdv.yearMin);
      if (nextAdv.yearMax) sp.set('yearMax', nextAdv.yearMax);
      if (nextAdv.ratingMin) sp.set('ratingMin', nextAdv.ratingMin);
      if (nextAdv.hasScreenshot) sp.set('hasScreenshot', '1');
      if (nextAdv.hasReview) sp.set('hasReview', '1');
      if (nextAdv.hasAnime) sp.set('hasAnime', '1');
      const qs = sp.toString();
      router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const handle = setTimeout(() => syncUrl(q, adv, source), 300);
    return () => clearTimeout(handle);
  }, [q, adv, source, syncUrl]);

  const advActive = isAdvActive(adv);

  // Quick search — VNDB
  useEffect(() => {
    if (source !== 'vndb') return;
    if (advActive) return; // advanced is driven by an explicit submit
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setTouched(true);
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || t.search.errorPrefix);
        }
        const data = await r.json();
        setResults(data.results);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, source, advActive, t.search.errorPrefix]);

  // Quick search — EGS-side (no VNDB extlink needed; works for games missing from VNDB).
  useEffect(() => {
    if (source !== 'egs') return;
    if (!q.trim()) {
      setEgsResults([]);
      setError(null);
      return;
    }
    setTouched(true);
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/egs/search?q=${encodeURIComponent(q.trim())}&limit=40`,
          { signal: ctrl.signal },
        );
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || t.search.errorPrefix);
        }
        const data = (await r.json()) as { candidates: EgsCandidate[] };
        setEgsResults(data.candidates);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setEgsResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, source, t.search.errorPrefix]);

  async function addEgs(c: EgsCandidate) {
    setAddingEgsId(c.id);
    try {
      const r = await fetch(`/api/egs/${c.id}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { vn_id: string };
      setAddedEgsIds((prev) => new Set(prev).add(c.id));
      toast.success(t.toast.added);
      startTransition(() => router.refresh());
      // Push the user to the new entry's page so they can polish the inventory.
      router.push(`/vn/${d.vn_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAddingEgsId(null);
    }
  }

  async function runAdvanced() {
    setTouched(true);
    setLoading(true);
    setError(null);
    try {
      const body = {
        q: q.trim() || undefined,
        langs: adv.langs.length ? adv.langs : undefined,
        platforms: adv.platforms.length ? adv.platforms : undefined,
        lengthMin: adv.lengthMin ?? undefined,
        lengthMax: adv.lengthMax ?? undefined,
        yearMin: adv.yearMin ? Number(adv.yearMin) : undefined,
        yearMax: adv.yearMax ? Number(adv.yearMax) : undefined,
        ratingMin: adv.ratingMin ? Number(adv.ratingMin) : undefined,
        hasScreenshot: adv.hasScreenshot || undefined,
        hasReview: adv.hasReview || undefined,
        hasAnime: adv.hasAnime || undefined,
      };
      const r = await fetch('/api/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.search.errorPrefix);
      const data = await r.json();
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  return (
    <DensityScopeProvider scope="search">
      <div
        className="mb-2 inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]"
        role="tablist"
        aria-label={t.search.sourceTabsLabel}
      >
        <button
          type="button"
          role="tab"
          aria-selected={source === 'vndb'}
          onClick={() => setSource('vndb')}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
        >
          <Database className="h-3 w-3" aria-hidden />
          {t.search.tabVndb}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'egs'}
          onClick={() => setSource('egs')}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'egs' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
          title={t.search.egsSourceHint}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {t.search.tabEgs}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'local'}
          onClick={() => setSource('local')}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
          title={t.search.localSourceHint}
        >
          <FileText className="h-3 w-3" aria-hidden />
          {t.search.tabLocal}
        </button>
      </div>
      <div className="relative mb-3">
        {source === 'egs' ? (
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" aria-hidden />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        )}
        <input
          ref={inputRef}
          className="input pl-9"
          placeholder={
            // Three-way placeholder — the previous fall-through
            // showed the VNDB hint while the user had the Local tab
            // active, which incorrectly suggested the input would
            // hit VNDB. Local mode now points at the operator's
            // own collection; EGS mode is unchanged.
            source === 'egs'
              ? t.search.egsPlaceholder
              : source === 'local'
                ? t.search.localPlaceholder
                : t.search.placeholder
          }
          aria-label={
            source === 'egs'
              ? t.search.egsPlaceholder
              : source === 'local'
                ? t.search.localPlaceholder
                : t.search.placeholder
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && source === 'vndb' && advActive) runAdvanced();
          }}
        />
      </div>

      {source === 'vndb' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn ${advOpen || advActive ? 'btn-primary' : ''}`}
            onClick={() => setAdvOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t.search.advanced}
            {advActive && <span className="rounded-full bg-bg/30 px-1.5 text-[10px]">●</span>}
            {advOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {advActive && (
            <button type="button" className="btn" onClick={() => setAdv(DEFAULT_ADV)}>
              {t.search.resetAdvanced}
            </button>
          )}
          {advActive && (
            <button type="button" className="btn btn-primary" onClick={runAdvanced}>
              {t.search.runAdvanced}
            </button>
          )}
        </div>
      )}

      {advOpen && source === 'vndb' && (
        <div className="mb-6 rounded-xl border border-border bg-bg-card p-4 text-xs">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.langsField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`chip ${adv.langs.includes(l) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, langs: toggle(s.langs, l) }))}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.platformsField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${adv.platforms.includes(p) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, platforms: toggle(s.platforms, p) }))}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.lengthField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = adv.lengthMin !== null && adv.lengthMax !== null && n >= adv.lengthMin && n <= adv.lengthMax;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() => {
                        // Click selects single value (min == max)
                        setAdv((s) => ({ ...s, lengthMin: n, lengthMax: n }));
                      }}
                    >
                      {n} · {t.search.lengthLabels[n - 1] ?? ''}
                    </button>
                  );
                })}
                {(adv.lengthMin !== null || adv.lengthMax !== null) && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setAdv((s) => ({ ...s, lengthMin: null, lengthMax: null }))}
                  >
                    {t.common.cancel}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.yearMin}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input"
                  placeholder="1990"
                  min={1970}
                  max={2099}
                  value={adv.yearMin}
                  onChange={(e) => setAdv((s) => ({ ...s, yearMin: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.yearMax}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input"
                  placeholder="2026"
                  min={1970}
                  max={2099}
                  value={adv.yearMax}
                  onChange={(e) => setAdv((s) => ({ ...s, yearMax: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.ratingMin}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input"
                  placeholder="70"
                  min={10}
                  max={100}
                  value={adv.ratingMin}
                  onChange={(e) => setAdv((s) => ({ ...s, ratingMin: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasScreenshot}
                  onChange={(e) => setAdv((s) => ({ ...s, hasScreenshot: e.target.checked }))}
                />
                {t.search.hasScreenshot}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasReview}
                  onChange={(e) => setAdv((s) => ({ ...s, hasReview: e.target.checked }))}
                />
                {t.search.hasReview}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasAnime}
                  onChange={(e) => setAdv((s) => ({ ...s, hasAnime: e.target.checked }))}
                />
                {t.search.hasAnime}
              </label>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {/*
        Source-tabbed rendering. The user explicitly picks one of:
          - 'vndb' — VN search via the VNDB Kana API
          - 'egs'  — game search via the ErogameScape SQL form
          - 'local' — free-text match across local notes / custom
            synopses / cached quotes.
        Each tab renders its OWN result body; we do NOT mix them
        in the same vertical flow (manual QA flagged the previous
        "all sources in one column" approach as hijacking the
        remote search experience).
      */}
      {source === 'local' ? (
        <TextualSearchPanel query={q} mode="standalone" />
      ) : loading ? (
        source === 'egs' ? <SkeletonRows count={6} /> : <SkeletonCardGrid count={18} />
      ) : !touched && !results.length && !egsResults.length ? (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">
            {source === 'egs' ? t.search.heroTitleEgs : t.search.heroTitle}
          </h2>
          <p className="text-muted">
            {source === 'egs' ? t.search.heroSubtitleEgs : t.search.heroSubtitle}
          </p>
        </div>
      ) : source === 'egs' ? (
        egsResults.length === 0 ? (
          <div className="py-20 text-center text-muted">{t.search.noResults}</div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-bg-card">
            {egsResults.map((c) => {
              const isAdding = addingEgsId === c.id;
              const isAdded = addedEgsIds.has(c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold">{c.gamename}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                      <span>EGS #{c.id}</span>
                      {c.sellday && <span>{c.sellday}</span>}
                      {c.median != null && (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <Star className="h-2.5 w-2.5 fill-accent" /> {c.median}
                        </span>
                      )}
                      {c.count != null && (
                        <span>{c.count.toLocaleString()} {t.egs.votes}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addEgs(c)}
                    disabled={isAdding || isAdded}
                    className={`btn shrink-0 ${isAdded ? '' : 'btn-primary'}`}
                  >
                    {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    {isAdded ? t.search.inCollection : t.search.addEgsOnly}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : results.length === 0 ? (
        <div className="py-20 text-center text-muted">{t.search.noResults}</div>
      ) : (
        <>
          {/* Density slider mirrors the affordance shipped on
              /wishlist, /recommendations, /top-ranked, /upcoming,
              /dumped, /egs. /search was the only card-grid surface
              that previously hard-coded `grid-cols-2..xl:grid-cols-6`
              and ignored the global density pref. */}
          <div className="mb-3 flex justify-end">
            <CardDensitySlider scope="search" />
          </div>
          <SearchResultsGrid results={results} />
        </>
      )}
    </DensityScopeProvider>
  );
}

/**
 * Density-aware grid for /search VN cards. Mirrors the pattern used
 * by every other card-grid surface: `repeat(auto-fill, minmax(min(100%,
 * Npx), 1fr))` driven by the shared `cardDensityPx` pref, so the
 * slider on the toolbar above changes the column count + cover size
 * without a page reload.
 */
function SearchResultsGrid({ results }: { results: VndbSearchHit[] }) {
  const { settings } = useDisplaySettings();
  const search = useSearchParams();
  const density = resolveScopedDensity(settings, 'search', search?.get('density') ?? null);
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: cardGridColumns(density),
  };
  return (
    <div className="grid gap-5" style={gridStyle}>
      {results.map((r) => (
        <VnCard key={r.id} enableAdd data={searchCardData(r)} />
      ))}
    </div>
  );
}
