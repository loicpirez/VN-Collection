'use client';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp, Circle, Database, FileText, Loader2, Plus, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import { VnCard, type CardData } from './VnCard';
import { SkeletonCardGrid, SkeletonRows } from './Skeleton';

const TextualSearchPanel = dynamic(() => import('./TextualSearchPanel').then((m) => m.TextualSearchPanel), {
  ssr: false,
  loading: () => <SkeletonRows count={4} />,
});
import { CardDensitySlider, cardGridColumns } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { ErrorAlert } from './ErrorAlert';
import { useToast } from './ToastProvider';
import { resolveScopedDensity, useDisplaySettings } from '@/lib/settings/client';
import { platformLabel } from '@/lib/platform-label';
import { languageDisplayName } from '@/lib/language-names';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum, formatIsoDateString } from '@/lib/locale-number';
import type { VndbSearchHit } from '@/lib/types';
import type { EgsCandidate } from '@/lib/erogamescape';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeAddedEgsVnId,
  decodeEgsSearchCandidates,
  decodeVndbSearchResults,
} from '@/lib/search-client-shape';
type SearchSource = 'vndb' | 'egs' | 'local';

const COMMON_LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'fr', 'de', 'es', 'it', 'ru'];
const COMMON_PLATFORMS = ['win', 'lin', 'mac', 'ios', 'and', 'web', 'swi', 'ps4', 'ps5', 'psv', 'psp', 'xb1', 'xxs', 'n3d'];

type AdvSort = '' | 'searchrank' | 'rating' | 'votecount' | 'released' | 'title';
const ADV_SORTS: readonly Exclude<AdvSort, ''>[] = ['searchrank', 'rating', 'votecount', 'released', 'title'];

/** Natural descending default for a given sort field, matching the route. */
function defaultReverseForSort(sort: Exclude<AdvSort, ''>): boolean {
  return sort !== 'searchrank';
}

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
  sort: AdvSort;
  reverse: boolean;
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
  sort: '',
  reverse: false,
};

function readAdvFromUrl(sp: URLSearchParams): AdvParams {
  const csv = (key: string) => sp.get(key)?.split(',').filter(Boolean) ?? [];
  const num = (key: string) => {
    const v = sp.get(key);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const rawSort = sp.get('sort') ?? '';
  const sort: AdvSort = (ADV_SORTS as readonly string[]).includes(rawSort) ? (rawSort as AdvSort) : '';
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
    sort,
    reverse: sort !== '' ? sp.get('reverse') === '1' : false,
  };
}

function readSourceFromUrl(sp: { get(name: string): string | null }): SearchSource {
  const raw = sp.get('source') ?? sp.get('src') ?? '';
  if (raw === 'egs') return 'egs';
  if (raw === 'local') return 'local';
  return 'vndb';
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
    adv.hasAnime ||
    adv.sort !== ''
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
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const initialAdvRef = useRef<AdvParams | null>(null);
  if (initialAdvRef.current === null) {
    initialAdvRef.current = readAdvFromUrl(new URLSearchParams(searchParams.toString()));
  }
  const initialAdv = initialAdvRef.current;
  const initialQ = searchParams.get('q') ?? '';
  // URL parameter takes either `?source=` (new, canonical) or `?src=`
  // (legacy short form). Accepts vndb / egs / local; anything else
  // falls back to vndb.
  const initialSource = readSourceFromUrl(searchParams);

  const [source, setSource] = useState<SearchSource>(initialSource);
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<VndbSearchHit[]>([]);
  const [egsResults, setEgsResults] = useState<EgsCandidate[]>([]);
  const [vndbLoading, setVndbLoading] = useState(initialSource !== 'egs' && (!!initialQ || isAdvActive(initialAdv)));
  const [egsLoading, setEgsLoading] = useState(initialSource === 'egs' && !!initialQ);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(!!initialQ || isAdvActive(initialAdv));
  const [advOpen, setAdvOpen] = useState(isAdvActive(initialAdv));
  const [adv, setAdv] = useState<AdvParams>(initialAdv);
  const [addingEgsId, setAddingEgsId] = useState<number | null>(null);
  const [addedEgsIds, setAddedEgsIds] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const observedUrlRef = useRef(urlKey);
  const ownedUrlKeysRef = useRef(new Set<string>());
  const pendingUrlAdvancedRunRef = useRef(false);
  const advancedAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const egsAddAbortRef = useRef<AbortController | null>(null);
  const egsAddInFlightRef = useRef(false);
  const panelId = useId();
  const tabIds = { vndb: useId(), egs: useId(), local: useId() } as const;
  const TABS = ['vndb', 'egs', 'local'] as const;

  useEffect(() => {
    if (!initialQ && !isAdvActive(initialAdv)) inputRef.current?.focus();
  }, [initialQ, initialAdv]);

  // Auto-run on first mount when arriving with advanced filters in the URL.
  const advAutoRunRef = useRef(false);
  const runAdvancedRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (advAutoRunRef.current) return;
    if (isAdvActive(initialAdv)) {
      advAutoRunRef.current = true;
      runAdvancedRef.current();
    }
  }, [initialAdv]);

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
      if (nextAdv.sort) {
        sp.set('sort', nextAdv.sort);
        if (nextAdv.reverse) sp.set('reverse', '1');
      }
      const qs = sp.toString();
      ownedUrlKeysRef.current.add(qs);
      if (ownedUrlKeysRef.current.size > 20) {
        const oldest = ownedUrlKeysRef.current.values().next().value;
        if (oldest !== undefined) ownedUrlKeysRef.current.delete(oldest);
      }
      router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (observedUrlRef.current === urlKey) return;
    observedUrlRef.current = urlKey;
    if (ownedUrlKeysRef.current.delete(urlKey)) return;
    ownedUrlKeysRef.current.clear();
    advancedAbortRef.current?.abort();
    advancedAbortRef.current = null;
    const sp = new URLSearchParams(urlKey);
    const nextAdv = readAdvFromUrl(sp);
    const nextQ = sp.get('q') ?? '';
    const nextSource = readSourceFromUrl(sp);
    const hasAdvanced = isAdvActive(nextAdv);
    setQ(nextQ);
    setAdv(nextAdv);
    setSource(nextSource);
    setTouched(!!nextQ || hasAdvanced);
    setAdvOpen(hasAdvanced);
    setResults([]);
    setEgsResults([]);
    setError(null);
    setVndbLoading(nextSource === 'vndb' && (!!nextQ || hasAdvanced));
    setEgsLoading(nextSource === 'egs' && !!nextQ);
    pendingUrlAdvancedRunRef.current = nextSource === 'vndb' && hasAdvanced;
  }, [urlKey]);

  useEffect(() => () => advancedAbortRef.current?.abort(), []);
  useEffect(() => () => {
    mountedRef.current = false;
    egsAddAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => syncUrl(q, adv, source), 300);
    return () => clearTimeout(handle);
  }, [q, adv, source, syncUrl]);

  const advActive = isAdvActive(adv);

  // Quick search - VNDB
  useEffect(() => {
    if (source !== 'vndb') return;
    if (advActive) return; // advanced is driven by an explicit submit
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setTouched(true);
    setVndbLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) {
          throw new Error(await readApiError(r, t.search.errorPrefix));
        }
        const results = decodeVndbSearchResults(await r.json());
        if (!results) throw new Error(t.search.errorPrefix);
        setResults(results);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        console.error('[SearchClient] VNDB search failed:', e);
        setError(e instanceof Error && e.message ? e.message : t.search.errorPrefix);
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setVndbLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, source, advActive, t.search.errorPrefix]);

  // Quick search - EGS-side (no VNDB extlink needed; works for games missing from VNDB).
  useEffect(() => {
    if (source !== 'egs') return;
    if (!q.trim()) {
      setEgsResults([]);
      setError(null);
      return;
    }
    setTouched(true);
    setEgsLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/egs/search?q=${encodeURIComponent(q.trim())}&limit=40`,
          { signal: ctrl.signal, cache: 'no-store' },
        );
        if (!r.ok) {
          throw new Error(await readApiError(r, t.search.errorPrefix));
        }
        const candidates = decodeEgsSearchCandidates(await r.json());
        if (!candidates) throw new Error(t.search.errorPrefix);
        setEgsResults(candidates);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        console.error('[SearchClient] EGS search failed:', e);
        setError(e instanceof Error && e.message ? e.message : t.search.errorPrefix);
        setEgsResults([]);
      } finally {
        if (!ctrl.signal.aborted) setEgsLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, source, t.search.errorPrefix]);

  async function addEgs(c: EgsCandidate) {
    if (egsAddInFlightRef.current) return;
    egsAddInFlightRef.current = true;
    const controller = new AbortController();
    egsAddAbortRef.current = controller;
    setAddingEgsId(c.id);
    try {
      const r = await fetch(`/api/egs/${c.id}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const vnId = decodeAddedEgsVnId(await r.json());
      if (!vnId) throw new Error(t.common.error);
      if (controller.signal.aborted || !mountedRef.current || egsAddAbortRef.current !== controller) return;
      setAddedEgsIds((prev) => new Set(prev).add(c.id));
      toast.success(t.toast.added);
      startTransition(() => router.refresh());
      router.push(`/vn/${vnId}`);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || controller.signal.aborted || !mountedRef.current || egsAddAbortRef.current !== controller) return;
      toast.error((e as Error).message);
    } finally {
      if (egsAddAbortRef.current === controller) {
        egsAddAbortRef.current = null;
        egsAddInFlightRef.current = false;
        if (mountedRef.current) setAddingEgsId(null);
      }
    }
  }

  async function runAdvanced() {
    advancedAbortRef.current?.abort();
    const controller = new AbortController();
    advancedAbortRef.current = controller;
    setTouched(true);
    setVndbLoading(true);
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
        sort: adv.sort || undefined,
        reverse: adv.sort ? adv.reverse : undefined,
      };
      const r = await fetch('/api/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.search.errorPrefix));
      const results = decodeVndbSearchResults(await r.json());
      if (!results) throw new Error(t.search.errorPrefix);
      if (controller.signal.aborted || advancedAbortRef.current !== controller) return;
      setResults(results);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || controller.signal.aborted || advancedAbortRef.current !== controller) return;
      console.error('[SearchClient] advanced search failed:', e);
      setError(e instanceof Error && e.message ? e.message : t.search.errorPrefix);
      setResults([]);
    } finally {
      if (advancedAbortRef.current === controller) {
        advancedAbortRef.current = null;
        setVndbLoading(false);
      }
    }
  }

  runAdvancedRef.current = runAdvanced;

  useEffect(() => {
    if (!pendingUrlAdvancedRunRef.current) return;
    pendingUrlAdvancedRunRef.current = false;
    runAdvancedRef.current();
  }, [q, adv, source]);

  const onQueryEnter = useCallback(() => runAdvancedRef.current(), []);

  function toggle(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  return (
    <DensityScopeProvider scope="search">
      <h1 className="sr-only">{t.nav.search}</h1>
      <div
        className="mb-2 inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]"
        role="tablist"
        aria-label={t.search.sourceTabsLabel}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const idx = TABS.indexOf(source as typeof TABS[number]);
          const next = e.key === 'ArrowRight' ? TABS[(idx + 1) % TABS.length] : TABS[(idx - 1 + TABS.length) % TABS.length];
          setSource(next);
          document.getElementById(tabIds[next])?.focus();
        }}
      >
        <button
          type="button"
          id={tabIds.vndb}
          role="tab"
          aria-selected={source === 'vndb'}
          aria-controls={panelId}
          onClick={() => setSource('vndb')}
          tabIndex={source === 'vndb' ? 0 : -1}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'vndb' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
        >
          <Database className="h-3 w-3" aria-hidden />
          {t.search.tabVndb}
        </button>
        <button
          type="button"
          id={tabIds.egs}
          role="tab"
          aria-selected={source === 'egs'}
          aria-controls={panelId}
          onClick={() => setSource('egs')}
          tabIndex={source === 'egs' ? 0 : -1}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'egs' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
          title={t.search.egsSourceHint}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {t.search.tabEgs}
        </button>
        <button
          type="button"
          id={tabIds.local}
          role="tab"
          aria-selected={source === 'local'}
          aria-controls={panelId}
          onClick={() => setSource('local')}
          tabIndex={source === 'local' ? 0 : -1}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded px-2 py-1 transition-colors ${
            source === 'local' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
          }`}
          title={t.search.localSourceHint}
        >
          <FileText className="h-3 w-3" aria-hidden />
          {t.search.tabLocal}
        </button>
      </div>
      <SearchInput
        inputRef={inputRef}
        value={q}
        onChange={setQ}
        placeholder={
          source === 'egs'
            ? t.search.egsPlaceholder
            : source === 'local'
              ? t.search.localPlaceholder
              : t.search.placeholder
        }
        egs={source === 'egs'}
        enterRunsAdvanced={source === 'vndb' && advActive}
        onEnter={onQueryEnter}
      />

      {source === 'vndb' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn ${advOpen || advActive ? 'btn-primary' : ''}`}
            onClick={() => setAdvOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t.search.advanced}
            {advActive && (
              <>
                <Circle className="h-2 w-2 fill-current opacity-80" aria-hidden />
                <span className="sr-only">{t.search.advancedActive}</span>
              </>
            )}
            {advOpen ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
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
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.langsField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={adv.langs.includes(l)}
                    className={`chip ${adv.langs.includes(l) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, langs: toggle(s.langs, l) }))}
                  >
                    {languageDisplayName(l, locale)}
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
                    aria-pressed={adv.platforms.includes(p)}
                    className={`chip ${adv.platforms.includes(p) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, platforms: toggle(s.platforms, p) }))}
                  >
                    {platformLabel(p)}
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
                      aria-pressed={active}
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() => {
                        // Click selects single value (min == max)
                        setAdv((s) => ({ ...s, lengthMin: n, lengthMax: n }));
                      }}
                    >
                      {n} / {t.search.lengthLabels[n - 1] ?? ''}
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
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.sortField}</h4>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="adv-sort">{t.search.sortField}</label>
                <select
                  id="adv-sort"
                  value={adv.sort}
                  onChange={(e) => {
                    const next = e.target.value as AdvSort;
                    setAdv((s) => ({
                      ...s,
                      sort: next,
                      reverse: next === '' ? false : defaultReverseForSort(next),
                    }));
                  }}
                  className="input min-h-[44px]"
                >
                  <option value="">{t.search.sortDefault}</option>
                  {ADV_SORTS.filter((s) => s !== 'searchrank').map((s) => (
                    <option key={s} value={s}>{t.search.sortOptions[s]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-pressed={adv.reverse}
                  disabled={adv.sort === ''}
                  className={`chip ${adv.reverse ? 'chip-active' : ''} disabled:opacity-40`}
                  onClick={() => setAdv((s) => ({ ...s, reverse: !s.reverse }))}
                >
                  {t.search.sortReverse}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}

      {/*
        Source-tabbed rendering. The user explicitly picks one of:
          - 'vndb' - VN search via the VNDB Kana API
          - 'egs'  - game search via the ErogameScape SQL form
          - 'local' - free-text match across local notes / custom
            synopses / cached quotes.
        Each tab renders its OWN result body; we do NOT mix them
        in the same vertical flow (manual QA flagged the previous
        "all sources in one column" approach as hijacking the
        remote search experience).
      */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabIds[source as keyof typeof tabIds]}
        aria-live="polite"
        aria-atomic="true"
        tabIndex={0}
        className="outline-none"
      >
      {source === 'local' ? (
        <TextualSearchPanel query={q} mode="standalone" />
      ) : source === 'egs' ? (
        egsLoading ? (
          <SkeletonRows count={6} />
        ) : !touched && !egsResults.length ? (
          <div className="py-20 text-center">
            <h2 className="mb-2 text-xl font-bold">{t.search.heroTitleEgs}</h2>
            <p className="text-muted">{t.search.heroSubtitleEgs}</p>
          </div>
        ) : egsResults.length === 0 ? (
          <div className="py-20 text-center text-muted">{t.search.noResults}</div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-bg-card">
            {egsResults.map((c) => {
              const isAdding = addingEgsId === c.id;
              const isAdded = addedEgsIds.has(c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold" title={c.gamename}>{c.gamename}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                      <span>EGS #{c.id}</span>
                      {c.sellday && <span>{formatIsoDateString(c.sellday, locale)}</span>}
                      {c.median != null && (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <Star className="h-2.5 w-2.5 fill-accent" aria-hidden /> {c.median}
                        </span>
                      )}
                      {c.count != null && (
                        <span>{fmtNum(c.count, locale)} {t.egs.votes}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addEgs(c)}
                    disabled={addingEgsId != null || isAdded}
                    className={`btn shrink-0 ${isAdded ? '' : 'btn-primary'}`}
                  >
                    {isAdding ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                    {isAdded ? t.search.inCollection : t.search.addEgsOnly}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : vndbLoading ? (
        <SkeletonCardGrid count={18} />
      ) : !touched && !results.length ? (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">{t.search.heroTitle}</h2>
          <p className="text-muted">{t.search.heroSubtitle}</p>
        </div>
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
      </div>
    </DensityScopeProvider>
  );
}

/**
 * Controlled search input, split out and memoized so the surrounding
 * tab bar, advanced panel, and results grid are not part of the
 * input's own render path. The parent still owns `q` (the debounced
 * URL sync and both quick-search effects key off it), so a keystroke
 * still updates parent state; extraction keeps that wiring untouched
 * while isolating the field's markup behind a stable prop boundary.
 */
const SearchInput = memo(function SearchInput({
  inputRef,
  value,
  onChange,
  placeholder,
  egs,
  enterRunsAdvanced,
  onEnter,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  egs: boolean;
  enterRunsAdvanced: boolean;
  onEnter: () => void;
}) {
  return (
    <div className="relative mb-3">
      {egs ? (
        <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" aria-hidden />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      )}
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        className="input pl-9"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && enterRunsAdvanced) onEnter();
        }}
      />
    </div>
  );
});

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
  const gridStyle: React.CSSProperties = useMemo(
    () => ({ gridTemplateColumns: cardGridColumns(density) }),
    [density],
  );
  return (
    <div className="grid gap-3" style={gridStyle}>
      {results.map((r) => (
        <VnCard key={r.id} enableAdd data={searchCardData(r)} />
      ))}
    </div>
  );
}
