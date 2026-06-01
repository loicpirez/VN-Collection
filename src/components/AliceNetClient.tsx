'use client';
import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookHeart,
  Building2,
  CheckCircle2,
  CheckSquare,
  Database,
  ExternalLink,
  Filter,
  Grid3X3,
  List,
  Link2,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { SafeImage } from './SafeImage';
import { SkeletonBlock } from './Skeleton';
import { useT, useLocale } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/dictionaries';
import { useRouter, useSearchParams } from 'next/navigation';
import { BCP47, formatCurrency, formatVndbDateString } from '@/lib/locale-number';
import {
  calculateVirtualGridWindow,
  parseCssPixelValue,
  VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT,
  VIRTUAL_GRID_DEFAULT_WIDTH,
  VIRTUAL_GRID_THRESHOLD,
} from '@/lib/virtual-grid';
import { timeAgo } from '@/lib/time-ago';
import { readApiError } from '@/lib/api-error-read';
import { CardDensitySlider } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';

import type {
  AliceNetCandidate,
  AliceNetItem,
  AliceNetStats,
  AliceNetFilterTab as FilterTab,
  AliceNetSort,
  AliceNetGroup,
  AliceNetView,
} from './alicenet-types';
import {
  ALICENET_SORTS,
  ALICENET_GROUPS,
  parseAliceNetPrice as parsePrice,
  comparableAliceNetDate as comparableDate,
  formatAliceNetDate,
  parseAliceNetDevs as parseDevs,
  parseAliceNetCandidates,
  alicenetMatchKind as matchKind,
  displayAliceNetTitle as displayTitle,
  displayAliceNetProducer as displayProducer,
} from './alicenet-types';
import { parseClientPreferenceRecord } from '@/lib/client-persisted-shape';
import {
  decodeAliceNetClientSnapshot,
  decodeAliceNetLoopResult,
  decodeAliceNetStockSyncResult,
  type AliceNetPendingCounts,
} from '@/lib/alicenet-client-shape';

/**
 * Format a raw alicenet price string ("¥4,270", "4,270円") as locale-native
 * JPY currency. Passes the canonical BCP-47 tag (not the bare `Locale`
 * enum) to `Intl.NumberFormat` so the grouping/symbol render per the
 * active locale. Falls back to the raw string when no positive integer
 * yen value can be parsed.
 */
function formatPriceJpy(value: string | null, locale: Locale): string {
  if (!value) return '';
  const n = parsePrice(value);
  if (n == null) return value;
  return formatCurrency(n, locale);
}

/**
 * Match/remap modal, lazy-loaded so its VNDB-search pipeline and dialog
 * a11y machinery leave the initial AliceNet page chunk. Mounted only while a
 * link target is selected; until then nothing of this module loads.
 */
const AliceNetLinkDialog = dynamic(
  () => import('./alicenet/AliceNetLinkDialog').then((m) => m.AliceNetLinkDialog),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" aria-hidden>
        <div className="absolute inset-0 bg-bg/80 backdrop-blur" />
        <div className="relative w-[min(92vw,640px)] max-h-[85vh] rounded-2xl border border-border bg-bg-card p-4 sm:p-5 shadow-card">
          <SkeletonBlock className="mb-3 h-5 w-40" />
          <SkeletonBlock className="mb-3 h-9 w-full" />
          <div className="space-y-2">
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
          </div>
        </div>
      </div>
    ),
  },
);

interface CandidateChipsProps {
  candidates: AliceNetCandidate[];
  currentId: string | null;
  code: string;
  onRemapped: () => void;
}

function CandidateChips({ candidates, currentId, code, onRemapped }: CandidateChipsProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const codeRef = useRef(code);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    codeRef.current = code;
    mutationInFlightRef.current = false;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    setBusy(null);
    return () => {
      mountedRef.current = false;
      mutationAbortRef.current?.abort();
    };
  }, [code]);

  if (candidates.length === 0) return null;

  async function pick(vnId: string) {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const owner = code;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setBusy(vnId);
    try {
      const r = await fetch(`/api/alicenet/${encodeURIComponent(code)}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || codeRef.current !== owner || mutationAbortRef.current !== controller) return;
      onRemapped();
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (mountedRef.current && codeRef.current === owner && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(null);
      }
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted">{t.alicenet.alicenetCandidates}:</span>
      {candidates.map((c) => {
        const isActive = c.id === currentId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c.id)}
            disabled={busy != null || isActive}
            title={`${c.title}${c.alttitle ? ` / ${c.alttitle}` : ''}${c.released ? ` (${formatVndbDateString(c.released, locale)})` : ''}`}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors sm:min-h-0 ${
              isActive
                ? 'bg-accent/20 text-accent cursor-default'
                : 'border border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
            }`}
          >
            {busy === c.id && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />}
            {c.id}
          </button>
        );
      })}
    </div>
  );
}

type ActiveOp =
  | 'idle'
  | 'downloading'
  | 'matching'
  | 'retrying'
  | 'vndb-from-egs'
  | 'retry-vndb-aggressive'
  | 'search-egs'
  | 'search-egs-aggressive'
  | 'download-vndb'
  | 'resolve-egs'
  | 'download-all';

interface RunTotals { processed: number; matched: number }

/**
 * Toolbar search field. Owns its own draft and debounces upward so a
 * keystroke re-renders only this input, not the whole AliceNet client
 * (stats grid, toolbar, every card). The committed `value` flows back
 * down so an external reset (Reset filters) clears the draft.
 */
const AliceNetSearchInput = memo(function AliceNetSearchInput({
  value,
  placeholder,
  onCommit,
  debounceMs,
}: {
  value: string;
  placeholder: string;
  onCommit: (next: string) => void;
  debounceMs: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const handle = setTimeout(() => onCommit(draft), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, value, onCommit, debounceMs]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        inputMode="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input min-h-[44px] w-full pl-9 text-sm"
      />
    </div>
  );
});

/**
 * Client-side page for the AliceNet second-hand stock browser.
 *
 * Download sequence (manual or via "Download all"):
 *   1. Download stock from AliceNET (uses configured proxy if set)
 *   2. Find VNDB + EGS matches (VNDB throttled at 1 req/s; EGS runs concurrently)
 *   3. Download VNDB metadata for matched VNs
 *   4. Resolve EGS via VNDB ext-links + title search
 *
 * All steps can be run individually or chained with "Download all".
 * Any step can be stopped with the Stop button.
 */
export function AliceNetClient() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const urlSearch = useSearchParams();
  const router = useRouter();
  const isFilterTab = (v: string | null): v is FilterTab =>
    v === 'all' || v === 'matched' || v === 'vndb' || v === 'egs_only' ||
    v === 'unmatched' || v === 'none_found' || v === 'collection' || v === 'wishlist';
  const isAliceNetSort = (v: string | null): v is AliceNetSort =>
    v != null && (ALICENET_SORTS as readonly string[]).includes(v);
  const isAliceNetGroup = (v: string | null): v is AliceNetGroup =>
    v != null && (ALICENET_GROUPS as readonly string[]).includes(v);
  const isAliceNetView = (v: string | null): v is AliceNetView => v === 'cards' || v === 'list';

  const ALICENET_PREFS_KEY = 'vncoll.alicenet.prefs.v1';
  function loadAliceNetPrefs(): { sort?: AliceNetSort; group?: AliceNetGroup; view?: AliceNetView } {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(ALICENET_PREFS_KEY);
      if (!raw) return {};
      const obj = parseClientPreferenceRecord(raw);
      const savedSort = typeof obj.sort === 'string' ? obj.sort : null;
      const savedGroup = typeof obj.group === 'string' ? obj.group : null;
      const savedView = typeof obj.view === 'string' ? obj.view : null;
      return {
        sort: isAliceNetSort(savedSort) ? savedSort : undefined,
        group: isAliceNetGroup(savedGroup) ? savedGroup : undefined,
        view: isAliceNetView(savedView) ? savedView : undefined,
      };
    } catch {
      return {};
    }
  }
  const [items, setItems] = useState<AliceNetItem[]>([]);
  const [stats, setStats] = useState<AliceNetStats>({ total: 0, matched: 0, vndb_matched: 0, egs_only: 0, unmatched: 0, unprocessed: 0, none_found: 0, in_collection: 0, in_wishlist: 0 });
  const [pending, setPending] = useState<AliceNetPendingCounts>({ vndb_pending: 0, egs_pending: 0 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<ActiveOp>('idle');
  const [opDone, setOpDone] = useState(0);
  const [opTotal, setOpTotal] = useState(0);
  const [opLabel, setOpLabel] = useState('');
  const [lastRun, setLastRun] = useState<{ label: string; processed: number; matched: number; error?: string } | null>(null);
  const [filter, setFilter] = useState<FilterTab>(() => {
    const v = urlSearch?.get('filter') ?? null;
    return isFilterTab(v) ? v : 'all';
  });
  const [sort, setSort] = useState<AliceNetSort>(() => {
    const v = urlSearch?.get('sort') ?? null;
    if (isAliceNetSort(v)) return v;
    return loadAliceNetPrefs().sort ?? 'match_status';
  });
  const [group, setGroup] = useState<AliceNetGroup>(() => {
    const v = urlSearch?.get('group') ?? null;
    if (isAliceNetGroup(v)) return v;
    return loadAliceNetPrefs().group ?? 'none';
  });
  const [view, setView] = useState<AliceNetView>(() => {
    const v = urlSearch?.get('view') ?? null;
    if (isAliceNetView(v)) return v;
    return loadAliceNetPrefs().view ?? 'cards';
  });
  const [showFilters, setShowFilters] = useState(() => urlSearch?.get('filters') !== '0');
  const [producerFilter, setProducerFilter] = useState(() => urlSearch?.get('producer') ?? '');
  const [yearMin, setYearMin] = useState(() => urlSearch?.get('yearMin') ?? '');
  const [yearMax, setYearMax] = useState(() => urlSearch?.get('yearMax') ?? '');
  const [priceMin, setPriceMin] = useState(() => urlSearch?.get('priceMin') ?? '');
  const [priceMax, setPriceMax] = useState(() => urlSearch?.get('priceMax') ?? '');
  const [search, setSearch] = useState(() => urlSearch?.get('q') ?? '');
  const commitSearch = useCallback((next: string) => setSearch(next), []);
  const [linkTarget, setLinkTarget] = useState<AliceNetItem | null>(null);
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);
  const opTokenRef = useRef(0);
  const opInFlightRef = useRef(false);
  const activeOpAbortRef = useRef<AbortController | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: '' });
  const bulkStopRef = useRef(false);
  const bulkTokenRef = useRef(0);
  const bulkInFlightRef = useRef(false);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const [resettingMatches, setResettingMatches] = useState(false);
  const resetInFlightRef = useRef(false);
  const resetAbortRef = useRef<AbortController | null>(null);
  const [clearingCode, setClearingCode] = useState<string | null>(null);
  const clearInFlightRef = useRef(false);
  const clearAbortRef = useRef<AbortController | null>(null);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const toggleSelected = useCallback((code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const { signal } = controller;
    if (mountedRef.current) setLoading(true);
    try {
      const r = await fetch('/api/alicenet', { cache: 'no-store', signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = decodeAliceNetClientSnapshot(await r.json());
      if (!d) throw new Error(t.common.error);
      if (signal.aborted || !mountedRef.current || loadAbortRef.current !== controller) return;
      setItems(d.items);
      setStats(d.stats);
      setPending(d.pending);
      setLastFetch(d.last_fetch);
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      if (mountedRef.current && loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [t, toast]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      activeOpAbortRef.current?.abort();
      bulkAbortRef.current?.abort();
      resetAbortRef.current?.abort();
      clearAbortRef.current?.abort();
      opTokenRef.current += 1;
      bulkTokenRef.current += 1;
      opInFlightRef.current = false;
      bulkInFlightRef.current = false;
      resetInFlightRef.current = false;
      clearInFlightRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ALICENET_PREFS_KEY, JSON.stringify({ sort, group, view }));
    } catch {
      // Quota / private-mode — ignore.
    }
  }, [sort, group, view]);

  useEffect(() => {
    const params = new URLSearchParams(urlSearch?.toString() ?? '');
    let dirty = false;
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) {
        if (params.get(key) != null) { params.delete(key); dirty = true; }
      } else if (params.get(key) !== value) {
        params.set(key, value);
        dirty = true;
      }
    };
    setOrDelete('filter', filter, 'all');
    setOrDelete('sort', sort, 'match_status');
    setOrDelete('group', group, 'none');
    setOrDelete('view', view, 'cards');
    setOrDelete('q', search, '');
    setOrDelete('producer', producerFilter, '');
    setOrDelete('yearMin', yearMin, '');
    setOrDelete('yearMax', yearMax, '');
    setOrDelete('priceMin', priceMin, '');
    setOrDelete('priceMax', priceMax, '');
    setOrDelete('filters', showFilters ? '1' : '0', '1');
    if (dirty) {
      const next = params.toString();
      router.replace(`/alicenet${next ? `?${next}` : ''}`, { scroll: false });
    }
  }, [filter, sort, group, view, search, producerFilter, yearMin, yearMax, priceMin, priceMax, showFilters, urlSearch, router]);

  function ownsOp(token: number): boolean {
    return mountedRef.current && opInFlightRef.current && opTokenRef.current === token;
  }

  function beginOp(op: Exclude<ActiveOp, 'idle'>): number | null {
    if (opInFlightRef.current) return null;
    opInFlightRef.current = true;
    stopRef.current = false;
    const token = opTokenRef.current + 1;
    opTokenRef.current = token;
    setActiveOp(op);
    return token;
  }

  function stopActiveOp() {
    stopRef.current = true;
    activeOpAbortRef.current?.abort();
  }

  function finishOp(token: number) {
    if (opTokenRef.current !== token) return;
    activeOpAbortRef.current = null;
    opInFlightRef.current = false;
    if (mountedRef.current) setActiveOp('idle');
  }

  async function downloadStock(token: number) {
    const controller = new AbortController();
    activeOpAbortRef.current = controller;
    const r = await fetch('/api/alicenet/fetch', { method: 'POST', signal: controller.signal });
    if (!r.ok) throw new Error(await readApiError(r, t.common.error));
    const d = decodeAliceNetStockSyncResult(await r.json());
    if (!d) throw new Error(t.common.error);
    if (!ownsOp(token) || controller.signal.aborted) return;
    if (activeOpAbortRef.current === controller) activeOpAbortRef.current = null;
    if (d.removed > 0) {
      toast.success(t.alicenet.alicenetStockRemoved.replace('{n}', String(d.removed)));
    }
  }

  async function runLoop(
    endpoint: string,
    body: Record<string, unknown>,
    label: string,
    getRemaining: (d: { processed: number; remaining: number }) => number,
    token: number,
    initialTotal = 0,
    batchSize = 5,
  ): Promise<RunTotals> {
    let done = 0;
    let matched = 0;
    const runStartedAt = Date.now();
    if (ownsOp(token)) {
      setOpDone(0);
      setOpTotal(initialTotal);
      setOpLabel(label);
    }
    while (ownsOp(token) && !stopRef.current) {
      const controller = new AbortController();
      activeOpAbortRef.current = controller;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, batch: batchSize, run_started_at: runStartedAt }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = decodeAliceNetLoopResult(await r.json());
      if (!d) throw new Error(t.common.error);
      if (!ownsOp(token) || controller.signal.aborted) return { processed: done, matched };
      if (activeOpAbortRef.current === controller) activeOpAbortRef.current = null;
      done += d.processed;
      matched += d.matched ?? 0;
      setOpDone(done);
      setOpTotal(done + getRemaining(d));
      if (d.processed === 0 || d.remaining === 0) break;
    }
    return { processed: done, matched };
  }

  async function runSingleOp(op: Exclude<ActiveOp, 'idle' | 'download-all'>) {
    const token = beginOp(op);
    if (token == null) return;
    let label = '';
    let totals: RunTotals = { processed: 0, matched: 0 };
    try {
      if (op === 'downloading') {
        label = t.alicenet.alicenetDownloading;
        setOpLabel(label);
        setOpDone(0);
        setOpTotal(0);
        await downloadStock(token);
      } else if (op === 'matching') {
        label = t.alicenet.alicenetMatchVndbEgs;
        totals = await runLoop('/api/alicenet/match-next', { retry_none: false }, label, (d) => d.remaining, token, stats.unprocessed, 5);
      } else if (op === 'retrying') {
        label = t.alicenet.alicenetRetryNone;
        totals = await runLoop('/api/alicenet/match-next', { retry_none: true }, label, (d) => d.remaining, token, stats.none_found, 4);
      } else if (op === 'vndb-from-egs') {
        label = t.alicenet.alicenetMatchVndbFromEgs;
        totals = await runLoop('/api/alicenet/match-vndb-from-egs', {}, label, (d) => d.remaining, token, stats.egs_only, 10);
      } else if (op === 'retry-vndb-aggressive') {
        label = t.alicenet.alicenetRetryVndbAggressive;
        totals = await runLoop('/api/alicenet/retry-vndb-aggressive', {}, label, (d) => d.remaining, token, stats.none_found, 4);
      } else if (op === 'search-egs') {
        label = t.alicenet.alicenetSearchEgsForNoVndb;
        totals = await runLoop('/api/alicenet/search-egs-no-vndb', { aggressive: false }, label, (d) => d.remaining, token, stats.none_found, 10);
      } else if (op === 'search-egs-aggressive') {
        label = t.alicenet.alicenetSearchEgsForNoVndbAggressive;
        totals = await runLoop('/api/alicenet/search-egs-no-vndb', { aggressive: true }, label, (d) => d.remaining, token, stats.none_found, 10);
      } else if (op === 'download-vndb') {
        label = t.alicenet.alicenetDownloadVndb;
        totals = await runLoop('/api/alicenet/download-vndb', {}, label, (d) => d.remaining, token, pending.vndb_pending, 10);
      } else if (op === 'resolve-egs') {
        label = t.alicenet.alicenetResolveEgs;
        totals = await runLoop('/api/alicenet/resolve-egs', {}, label, (d) => d.remaining, token, pending.egs_pending, 10);
      }
      if (!ownsOp(token) || stopRef.current) return;
      await load();
      if (!ownsOp(token)) return;
      setLastRun({ label: label || op, ...totals });
    } catch (e) {
      if (!ownsOp(token) || (e instanceof Error && e.name === 'AbortError')) return;
      const message = `${label || op}: ${(e as Error).message}`;
      setLastRun({ label: label || op, ...totals, error: (e as Error).message });
      toast.error(message, 0);
    } finally {
      finishOp(token);
    }
  }

  async function runDownloadAll() {
    const token = beginOp('download-all');
    if (token == null) return;
    let label = t.alicenet.alicenetDownloading;
    try {
      setOpLabel(label);
      setOpDone(0);
      setOpTotal(0);
      await downloadStock(token);
      if (!ownsOp(token) || stopRef.current) return;
      label = t.alicenet.alicenetMatchVndbEgs;
      await runLoop('/api/alicenet/match-next', { retry_none: false }, label, (d) => d.remaining, token, stats.unprocessed, 5);
      if (!ownsOp(token) || stopRef.current) return;
      label = t.alicenet.alicenetRetryNone;
      await runLoop('/api/alicenet/match-next', { retry_none: true }, label, (d) => d.remaining, token, stats.none_found, 4);
      if (!ownsOp(token) || stopRef.current) return;
      label = t.alicenet.alicenetMatchVndbFromEgs;
      await runLoop('/api/alicenet/match-vndb-from-egs', {}, label, (d) => d.remaining, token, stats.egs_only, 10);
      if (!ownsOp(token) || stopRef.current) return;
      label = t.alicenet.alicenetDownloadVndb;
      await runLoop('/api/alicenet/download-vndb', {}, label, (d) => d.remaining, token, pending.vndb_pending, 10);
      if (!ownsOp(token) || stopRef.current) return;
      label = t.alicenet.alicenetResolveEgs;
      await runLoop('/api/alicenet/resolve-egs', {}, label, (d) => d.remaining, token, pending.egs_pending, 10);
      if (!ownsOp(token) || stopRef.current) return;
      await load();
    } catch (e) {
      if (!ownsOp(token) || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error(`${label}: ${(e as Error).message}`, 0);
    } finally {
      finishOp(token);
    }
  }

  async function resetAutoMatches() {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    const controller = new AbortController();
    resetAbortRef.current?.abort();
    resetAbortRef.current = controller;
    setResettingMatches(true);
    const ok = await confirm({ message: t.alicenet.alicenetResetConfirm, tone: 'danger' });
    if (!ok || controller.signal.aborted || !mountedRef.current || resetAbortRef.current !== controller) {
      if (resetAbortRef.current === controller) {
        resetAbortRef.current = null;
        resetInFlightRef.current = false;
        if (mountedRef.current) setResettingMatches(false);
      }
      return;
    }
    try {
      const r = await fetch('/api/alicenet/reset-matches', { method: 'POST', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || resetAbortRef.current !== controller) return;
      await load();
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (resetAbortRef.current === controller) {
        resetAbortRef.current = null;
        resetInFlightRef.current = false;
        if (mountedRef.current) setResettingMatches(false);
      }
    }
  }

  async function clearLink(code: string) {
    if (clearInFlightRef.current) return;
    clearInFlightRef.current = true;
    const controller = new AbortController();
    clearAbortRef.current?.abort();
    clearAbortRef.current = controller;
    setClearingCode(code);
    const ok = await confirm({
      message: t.alicenet.alicenetClearMatchConfirm,
      tone: 'danger',
    });
    if (!ok || controller.signal.aborted || !mountedRef.current || clearAbortRef.current !== controller) {
      if (clearAbortRef.current === controller) {
        clearAbortRef.current = null;
        clearInFlightRef.current = false;
        if (mountedRef.current) setClearingCode(null);
      }
      return;
    }
    try {
      const r = await fetch(`/api/alicenet/${encodeURIComponent(code)}/link`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || clearAbortRef.current !== controller) return;
      await load();
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (clearAbortRef.current === controller) {
        clearAbortRef.current = null;
        clearInFlightRef.current = false;
        if (mountedRef.current) setClearingCode(null);
      }
    }
  }

  const isBusy = activeOp !== 'idle';
  const opPct = opTotal > 0 ? Math.round((opDone / opTotal) * 100) : 0;
  const matchPct = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;
  const showStatsSkeleton = loading && items.length === 0 && stats.total === 0;

  const producers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of items) {
      const devs = parseDevs(item.vn_developers);
      for (const d of devs) {
        if (!d.id) continue;
        const prev = map.get(d.id);
        map.set(d.id, { id: d.id, name: d.name || d.id, count: (prev?.count ?? 0) + 1 });
      }
      if (devs.length === 0 && item.egs_brand) {
        const id = `egs:${item.egs_brand}`;
        const prev = map.get(id);
        map.set(id, { id, name: item.egs_brand, count: (prev?.count ?? 0) + 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'matched') list = list.filter((i) => i.vn_id !== null || i.egs_id !== null);
    else if (filter === 'vndb') list = list.filter((i) => i.vn_id !== null);
    else if (filter === 'egs_only') list = list.filter((i) => i.vn_id === null && i.egs_id !== null);
    else if (filter === 'unmatched') list = list.filter((i) => i.vn_id === null && i.egs_id === null);
    else if (filter === 'none_found') list = list.filter((i) => i.vn_id === null && i.egs_id === null && i.vn_match_source === 'none');
    else if (filter === 'collection') list = list.filter((i) => i.in_collection === 1);
    else if (filter === 'wishlist') list = list.filter((i) => i.in_wishlist === 1);
    if (producerFilter) {
      list = list.filter((i) => {
        if (producerFilter.startsWith('egs:')) return `egs:${i.egs_brand ?? ''}` === producerFilter;
        return parseDevs(i.vn_developers).some((d) => d.id === producerFilter);
      });
    }
    const yMin = yearMin ? Number(yearMin) : null;
    const yMax = yearMax ? Number(yearMax) : null;
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    if (yMin != null || yMax != null) {
      list = list.filter((i) => {
        const year = Number((i.release_date || i.egs_release_date || '').slice(0, 4));
        if (!Number.isFinite(year)) return false;
        if (yMin != null && year < yMin) return false;
        if (yMax != null && year > yMax) return false;
        return true;
      });
    }
    if (pMin != null || pMax != null) {
      list = list.filter((i) => {
        const price = parsePrice(i.sale_price);
        if (price == null) return false;
        if (pMin != null && price < pMin) return false;
        if (pMax != null && price > pMax) return false;
        return true;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.egs_title?.toLowerCase().includes(q) ?? false) ||
          (i.egs_brand?.toLowerCase().includes(q) ?? false) ||
          (i.search_title?.toLowerCase().includes(q) ?? false) ||
          i.code.includes(q) ||
          (i.vn_id?.toLowerCase().includes(q) ?? false) ||
          String(i.egs_id ?? '').includes(q),
      );
    }
    return list;
  }, [items, filter, producerFilter, search, yearMin, yearMax, priceMin, priceMax]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      switch (sort) {
        case 'title':
          return displayTitle(a).localeCompare(displayTitle(b));
        case 'release_desc':
          return comparableDate(b.release_date || b.egs_release_date).localeCompare(comparableDate(a.release_date || a.egs_release_date));
        case 'release_asc':
          return comparableDate(a.release_date || a.egs_release_date).localeCompare(comparableDate(b.release_date || b.egs_release_date));
        case 'price_asc':
          return (parsePrice(a.sale_price) ?? Number.MAX_SAFE_INTEGER) - (parsePrice(b.sale_price) ?? Number.MAX_SAFE_INTEGER);
        case 'price_desc':
          return (parsePrice(b.sale_price) ?? 0) - (parsePrice(a.sale_price) ?? 0);
        case 'updated_desc':
          return (b.updated_at ?? 0) - (a.updated_at ?? 0);
        case 'match_status': {
          const rank = { unresolved: 0, new: 1, egs: 2, vndb: 3 } as const;
          return rank[matchKind(a)] - rank[matchKind(b)] || displayTitle(a).localeCompare(displayTitle(b));
        }
        default: {
          const _exhaustive: never = sort;
          return String(_exhaustive).localeCompare('');
        }
      }
    });
    return out;
  }, [filtered, sort]);

  const grouped = useMemo<{ key: string; items: AliceNetItem[] }[]>(() => {
    if (group === 'none') return [{ key: '', items: sorted }];
    const buckets = new Map<string, AliceNetItem[]>();
    for (const item of sorted) {
      let key = '';
      if (group === 'match') {
        key = matchKind(item) === 'vndb'
          ? t.alicenet.alicenetVndbMatched
          : matchKind(item) === 'egs'
            ? t.alicenet.alicenetEgsOnly
            : t.alicenet.alicenetNeedsMatch;
      } else if (group === 'producer') {
        key = displayProducer(item) || t.wishlist.groupUnknown;
      } else if (group === 'year') {
        key = (item.release_date || item.egs_release_date)?.slice(0, 4) || t.wishlist.groupUnknown;
      }
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (group === 'year' ? b.localeCompare(a) : a.localeCompare(b)))
      .map(([key, items]) => ({ key, items }));
  }, [sorted, group, t.alicenet.alicenetVndbMatched, t.alicenet.alicenetEgsOnly, t.alicenet.alicenetNeedsMatch, t.wishlist.groupUnknown]);

  const tabs: { id: FilterTab; label: string; count: number; icon?: React.ReactNode }[] = [
    { id: 'all', label: t.alicenet.alicenetFilterAll, count: stats.total },
    { id: 'matched', label: t.alicenet.alicenetFilterMatched, count: stats.matched },
    { id: 'vndb', label: t.alicenet.alicenetVndbMatched, count: stats.vndb_matched },
    { id: 'egs_only', label: t.alicenet.alicenetEgsOnly, count: stats.egs_only },
    { id: 'unmatched', label: t.alicenet.alicenetFilterUnmatched, count: stats.unmatched },
    { id: 'none_found', label: t.alicenet.alicenetNoneFound, count: stats.none_found },
    { id: 'collection', label: t.alicenet.alicenetInCollection, count: stats.in_collection, icon: <BookHeart className="h-3 w-3 text-status-completed" aria-hidden /> },
    { id: 'wishlist', label: t.alicenet.alicenetInWishlist, count: stats.in_wishlist, icon: <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden /> },
  ];

  const sortLabels: Record<AliceNetSort, string> = {
    match_status: t.alicenet.alicenetSortMatchStatus,
    release_desc: t.alicenet.alicenetSortReleaseDesc,
    release_asc: t.alicenet.alicenetSortReleaseAsc,
    price_asc: t.alicenet.alicenetSortPriceAsc,
    price_desc: t.alicenet.alicenetSortPriceDesc,
    title: t.alicenet.alicenetSortTitle,
    updated_desc: t.alicenet.alicenetSortUpdatedDesc,
  };

  const groupLabels: Record<AliceNetGroup, string> = {
    none: t.alicenet.alicenetGroupNone,
    match: t.alicenet.alicenetGroupMatch,
    producer: t.alicenet.alicenetGroupProducer,
    year: t.alicenet.alicenetGroupYear,
  };

  const activeFilterCount =
    (filter !== 'all' ? 1 : 0) +
    (producerFilter ? 1 : 0) +
    (yearMin ? 1 : 0) +
    (yearMax ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0) +
    (search ? 1 : 0);

  function resetFilters() {
    setFilter('all');
    setProducerFilter('');
    setYearMin('');
    setYearMax('');
    setPriceMin('');
    setPriceMax('');
    setSearch('');
  }

  function selectAllVisible() {
    setSelectMode(true);
    setSelected(new Set(sorted.map((i) => i.code)));
  }

  function selectMatchedVisible() {
    setSelectMode(true);
    setSelected(new Set(sorted.filter((i) => i.vn_id !== null).map((i) => i.code)));
  }

  function ownsBulk(token: number): boolean {
    return mountedRef.current && bulkInFlightRef.current && bulkTokenRef.current === token;
  }

  function stopBulkClear() {
    bulkStopRef.current = true;
    bulkAbortRef.current?.abort();
  }

  async function bulkClearLinks() {
    if (bulkInFlightRef.current) return;
    const codes = sorted.filter((i) => i.vn_id !== null && selected.has(i.code)).map((i) => i.code);
    if (codes.length === 0) return;
    bulkInFlightRef.current = true;
    const token = bulkTokenRef.current + 1;
    bulkTokenRef.current = token;
    const selectionKey = [...selected].sort().join('|');
    const ok = await confirm({
      message: t.alicenet.alicenetBulkClearLinkConfirm.replace('{n}', String(codes.length)),
      tone: 'danger',
      requireTyping: codes.length >= 5 ? 'DELETE' : undefined,
    });
    if (!ok || !ownsBulk(token) || [...selectedRef.current].sort().join('|') !== selectionKey) {
      if (bulkTokenRef.current === token) bulkInFlightRef.current = false;
      return;
    }
    bulkStopRef.current = false;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: codes.length, current: '' });
    let done = 0;
    try {
      for (const code of codes) {
        if (!ownsBulk(token) || bulkStopRef.current) break;
        setBulkProgress({ done, total: codes.length, current: code });
        const controller = new AbortController();
        bulkAbortRef.current = controller;
        try {
          const r = await fetch(`/api/alicenet/${encodeURIComponent(code)}/link`, { method: 'DELETE', signal: controller.signal });
          if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        } catch (e) {
          if (controller.signal.aborted && bulkStopRef.current) break;
          throw e;
        }
        if (!ownsBulk(token) || controller.signal.aborted) break;
        if (bulkAbortRef.current === controller) bulkAbortRef.current = null;
        done += 1;
        setBulkProgress({ done, total: codes.length, current: code });
      }
      if (!ownsBulk(token)) return;
      if (bulkStopRef.current) toast.warning(t.bulk.abortedTitle);
      await load();
    } catch (e) {
      if (!ownsBulk(token) || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
      await load();
    } finally {
      if (bulkTokenRef.current === token) {
        bulkAbortRef.current = null;
        bulkInFlightRef.current = false;
        if (mountedRef.current) {
          setBulkBusy(false);
          setBulkProgress({ done: 0, total: 0, current: '' });
          clearSelection();
        }
      }
    }
  }

  function statusBadge(item: AliceNetItem) {
    const kind = matchKind(item);
    if (kind === 'vndb') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          {t.alicenet.alicenetVndbMatched}
        </span>
      );
    }
    if (kind === 'egs') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-status-playing/25 bg-status-playing/10 px-2 py-0.5 text-[11px] font-semibold text-status-playing">
          <PackageCheck className="h-3 w-3" aria-hidden />
          {t.alicenet.alicenetEgsOnly}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
        <Search className="h-3 w-3" aria-hidden />
        {kind === 'unresolved' ? t.alicenet.alicenetNeedsMatch : t.alicenet.alicenetNotYetMatched}
      </span>
    );
  }

  function quickLinks(item: AliceNetItem) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {item.vn_id && (
          <a
            href={`/vn/${item.vn_id}`}
            className="inline-flex min-h-[44px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-mono text-accent hover:bg-accent/20 sm:min-h-[32px]"
          >
            <Link2 className="h-3 w-3" aria-hidden />
            {item.vn_id}
          </a>
        )}
        {item.egs_id && (
          <a
            href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${item.egs_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 rounded border border-border bg-bg-elev/50 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-[32px]"
            title={`${t.alicenet.alicenetEgsId} ${item.egs_id}`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            EGS {item.egs_id}
          </a>
        )}
      </div>
    );
  }

  function renderAliceNetCard(item: AliceNetItem) {
    const candidates = parseAliceNetCandidates(item.vn_candidates);
    const producer = displayProducer(item);
    const image = item.vn_image_url || item.egs_image_url;
    const date = item.release_date || item.egs_release_date;
    const isSelected = selected.has(item.code);
    return (
      <article key={item.code} role="listitem" className={`group flex min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-bg-card transition-all hover:-translate-y-0.5 hover:shadow-card ${isSelected ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-accent'}`}>
        <div className="relative aspect-[2/3] bg-bg-elev">
          <SafeImage
            src={image}
            localSrc={item.vn_local_image}
            sexual={item.vn_image_sexual}
            alt={displayTitle(item)}
            className="h-full w-full"
            fit="cover"
          />
          {selectMode && (
            <button
              type="button"
              onClick={() => toggleSelected(item.code)}
              aria-pressed={isSelected}
              aria-label={t.alicenet.alicenetSelectItem.replace('{title}', displayTitle(item))}
              className={`absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border backdrop-blur transition-colors ${isSelected ? 'border-accent bg-accent text-bg' : 'border-border bg-bg/80 text-muted hover:border-accent hover:text-accent'}`}
            >
              {isSelected ? <CheckSquare className="h-5 w-5" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
            </button>
          )}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{statusBadge(item)}</div>
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {item.in_wishlist === 1 && (
              <span className="rounded-full border border-status-dropped/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-dropped backdrop-blur">
                {t.alicenet.alicenetInWishlist}
              </span>
            )}
            {item.in_collection === 1 && (
              <span className="rounded-full border border-status-completed/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-completed backdrop-blur">
                {t.alicenet.alicenetInCollection}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug" title={item.title}>{displayTitle(item)}</h3>
            {item.egs_title && item.egs_title !== item.title && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted" title={item.title}>{item.title}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
            {item.sale_price && <span className="font-semibold text-white">{formatPriceJpy(item.sale_price, locale)}</span>}
            {date && <span>{formatAliceNetDate(date, locale)}</span>}
            <span className="font-mono opacity-70">{item.code}</span>
          </div>
          {producer && (
            <button
              type="button"
              onClick={() => {
                const id = item.vn_developers ? parseDevs(item.vn_developers)[0]?.id : null;
                setProducerFilter(id || (item.egs_brand ? `egs:${item.egs_brand}` : ''));
              }}
              className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
            >
              <Building2 className="h-3 w-3" aria-hidden />
              {producer}
            </button>
          )}
          {item.search_title && (
            <p className="line-clamp-1 text-[10px] text-muted/70" title={item.search_title}>
              {t.alicenet.alicenetSearchedAs.replace('{q}', item.search_title)}
            </p>
          )}
          {quickLinks(item)}
          {candidates.length > 1 && (
            <CandidateChips candidates={candidates} currentId={item.vn_id} code={item.code} onRemapped={load} />
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <button type="button" onClick={() => setLinkTarget(item)} className="btn btn-xs min-h-[44px] sm:min-h-0">
              <Search className="h-3 w-3" />
              {item.vn_id ? t.alicenet.alicenetRemap : t.alicenet.alicenetFindMatch}
            </button>
            {item.vn_id && (
              <button
                type="button"
                onClick={() => clearLink(item.code)}
                disabled={clearingCode === item.code}
                className="btn btn-xs min-h-[44px] min-w-[44px] text-muted hover:text-status-dropped disabled:opacity-50 sm:min-h-0 sm:min-w-0"
                title={t.alicenet.alicenetClearMatch}
              >
                {clearingCode === item.code ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  function renderAliceNetRow(item: AliceNetItem) {
    const producer = displayProducer(item);
    const date = item.release_date || item.egs_release_date;
    const isSelected = selected.has(item.code);
    return (
      <li key={item.code} className={`rounded-xl border bg-bg-card p-3 transition-shadow hover:shadow-card ${isSelected ? 'border-accent ring-2 ring-accent' : 'border-border'}`}>
        <div className="flex gap-3">
          {selectMode && (
            <button
              type="button"
              onClick={() => toggleSelected(item.code)}
              aria-pressed={isSelected}
              aria-label={t.alicenet.alicenetSelectItem.replace('{title}', displayTitle(item))}
              className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center self-start rounded-md border transition-colors ${isSelected ? 'border-accent bg-accent text-bg' : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'}`}
            >
              {isSelected ? <CheckSquare className="h-5 w-5" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
            </button>
          )}
          <SafeImage
            src={item.vn_image_url || item.egs_image_url}
            localSrc={item.vn_local_image}
            sexual={item.vn_image_sexual}
            alt={displayTitle(item)}
            className="h-20 w-14 shrink-0 rounded-lg"
            fit="cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" title={item.title}>{displayTitle(item)}</p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
                  {item.sale_price && <span className="font-semibold text-white">{formatPriceJpy(item.sale_price, locale)}</span>}
                  {date && <span>{formatAliceNetDate(date, locale)}</span>}
                  <span className="font-mono opacity-60">{item.code}</span>
                  {producer && <span>{producer}</span>}
                </div>
                {item.search_title && (
                  <p className="mt-1 text-[10px] italic text-muted/70">
                    {t.alicenet.alicenetSearchedAs.replace('{q}', item.search_title)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {statusBadge(item)}
                {quickLinks(item)}
                <button type="button" onClick={() => setLinkTarget(item)} className="btn btn-xs min-h-[44px] sm:min-h-0">
                  <Search className="h-3 w-3" />
                  {item.vn_id ? t.alicenet.alicenetRemap : t.alicenet.alicenetFindMatch}
                </button>
              </div>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <DensityScopeProvider scope="aliceNet" className="page-space mx-auto max-w-screen-2xl px-4 py-6">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-xl font-bold">{t.alicenet.alicenetTitle}</h1>
        {lastFetch && (
          <span className="text-xs text-muted">
            {t.alicenet.alicenetLastFetch.replace('{date}', timeAgo(lastFetch, t))}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {showStatsSkeleton ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <SkeletonBlock className="mx-auto mb-3 h-3 w-20" />
              <SkeletonBlock className="mx-auto h-8 w-14" />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.alicenet.alicenetFilterAll}</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.alicenet.alicenetFilterMatched}</div>
              <div className="text-2xl font-bold text-status-completed">{stats.matched}</div>
              {stats.total > 0 && <div className="mt-0.5 text-[10px] text-muted">{matchPct}%</div>}
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.alicenet.alicenetFilterUnmatched}</div>
              <div className="text-2xl font-bold">{stats.unmatched}</div>
              {(stats.unprocessed > 0 || stats.none_found > 0) && (
                <div className="mt-0.5 text-[10px] text-status-on_hold/80">
                  {t.alicenet.alicenetUnmatchedBreakdown
                    .replace('{new}', String(stats.unprocessed))
                    .replace('{none}', String(stats.none_found))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-status-on_hold/20 bg-status-on_hold/5 p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.alicenet.alicenetNoneFound}</div>
              <div className="text-2xl font-bold text-status-on_hold">{stats.none_found}</div>
              {stats.unprocessed > 0 && <div className="mt-0.5 text-[10px] text-muted">{stats.unprocessed} {t.alicenet.alicenetNotYetMatched}</div>}
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-completed" aria-hidden />
                {t.alicenet.alicenetInCollection}
              </div>
              <div className="text-2xl font-bold text-status-completed">{stats.in_collection}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden />
                {t.alicenet.alicenetInWishlist}
              </div>
              <div className="text-2xl font-bold text-status-dropped">{stats.in_wishlist}</div>
            </div>
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className={`mb-5 rounded-xl border border-border bg-bg-card p-3 ${isBusy ? 'sticky top-2 z-30 shadow-card' : ''}`}>
        {isBusy ? (
          <div className="flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={stopActiveOp}
              className="min-h-[44px] shrink-0 rounded-md border border-border px-3 py-1 text-[11px] font-semibold text-muted hover:border-status-dropped hover:text-status-dropped"
            >
              {t.alicenet.alicenetStopMatch}
            </button>
            <div className="min-w-0 flex-1" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                <span className="truncate">{opLabel}</span>
                {opTotal > 0 && (
                  <span className="ml-auto shrink-0 tabular-nums">{opDone}/{opTotal}</span>
                )}
              </div>
              {opTotal > 0 && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(opPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={opLabel}
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-elev"
                >
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${opPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1.25fr_1.15fr_auto]">
            <section className="min-w-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.alicenet.alicenetActionPipeline}</div>
              <button
                type="button"
                onClick={runDownloadAll}
                className="btn btn-primary btn-sm w-full sm:w-auto"
                title={t.alicenet.alicenetDownloadAllHint}
              >
                <Zap className="h-3.5 w-3.5" />
                {t.alicenet.alicenetDownloadAll}
              </button>
              <p className="mt-1 text-[11px] leading-snug text-muted">{t.alicenet.alicenetDownloadAllHint}</p>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.alicenet.alicenetActionStock}</div>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runSingleOp('downloading')}
                className="btn btn-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t.alicenet.alicenetSyncStock}
              </button>
              <button
                type="button"
                onClick={() => runSingleOp('matching')}
                disabled={stats.unprocessed === 0}
                className="btn btn-sm"
              >
                <Search className="h-3.5 w-3.5" />
                {t.alicenet.alicenetMatchVndbEgs}
                {stats.unprocessed > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{stats.unprocessed}</span>
                )}
              </button>
              </div>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.alicenet.alicenetActionRecovery}</div>
              <button
                type="button"
                onClick={() => runSingleOp('retrying')}
                disabled={stats.none_found === 0}
                className="btn btn-sm btn-primary w-full sm:w-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.alicenet.alicenetRetryNone}
                {stats.none_found > 0 && (
                  <span className="ml-1 rounded bg-bg/20 px-1 text-[10px] text-bg">{stats.none_found}</span>
                )}
              </button>
              <p className="mt-1 text-[11px] leading-snug text-muted">{t.alicenet.alicenetSmartRetryHint}</p>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.alicenet.alicenetActionData}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runSingleOp('download-vndb')}
                  disabled={pending.vndb_pending === 0}
                  className="btn btn-sm"
                >
                  <Database className="h-3.5 w-3.5" />
                  {t.alicenet.alicenetDownloadVndb}
                  {pending.vndb_pending > 0 && (
                    <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{pending.vndb_pending}</span>
                  )}
                </button>
              <button
                type="button"
                onClick={() => runSingleOp('resolve-egs')}
                disabled={pending.egs_pending === 0}
                className="btn btn-sm"
              >
                <Link2 className="h-3.5 w-3.5" />
                {t.alicenet.alicenetResolveEgs}
                {pending.egs_pending > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{pending.egs_pending}</span>
                )}
              </button>
              </div>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.alicenet.alicenetActionMaintenance}</div>
              <button
                type="button"
                onClick={resetAutoMatches}
                disabled={stats.matched === 0 || resettingMatches}
                className="btn btn-sm text-muted hover:border-status-dropped hover:text-status-dropped disabled:opacity-50"
              >
                {resettingMatches ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" />}
                {t.alicenet.alicenetResetAutoMatches}
              </button>
            </section>
          </div>
        )}
      </div>

      {/* Browsing controls */}
      <div className="mb-4 rounded-xl border border-border bg-bg-card p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.alicenet.alicenetFilterAll}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors sm:min-h-[36px] ${
                  filter === tab.id
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
                }`}
              >
                {tab.icon ?? null}
                <span>{tab.label}</span>
                <span className={`rounded px-1 text-[10px] ${filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto] lg:items-end">
            <AliceNetSearchInput
              value={search}
              placeholder={t.alicenet.alicenetSearchPlaceholder}
              onCommit={commitSearch}
              debounceMs={250}
            />

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetSortLabel}
              <select value={sort} onChange={(e) => setSort(e.target.value as AliceNetSort)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                {ALICENET_SORTS.map((id) => <option key={id} value={id}>{sortLabels[id]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetGroupLabel}
              <select value={group} onChange={(e) => setGroup(e.target.value as AliceNetGroup)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                {ALICENET_GROUPS.map((id) => <option key={id} value={id}>{groupLabels[id]}</option>)}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2 lg:min-w-[24rem] lg:justify-end">
              <div className="inline-flex rounded-md border border-border bg-bg-elev/40 p-1" role="group" aria-label={t.alicenet.alicenetViewLabel}>
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'cards' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.alicenet.alicenetViewCards}
                  title={t.alicenet.alicenetViewCards}
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'list' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.alicenet.alicenetViewList}
                  title={t.alicenet.alicenetViewList}
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`btn btn-sm ${showFilters || activeFilterCount > 0 ? 'border-accent text-accent' : ''}`}
                aria-expanded={showFilters}
              >
                <Filter className="h-3.5 w-3.5" />
                {t.alicenet.alicenetFilters}
                {activeFilterCount > 0 && <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">{activeFilterCount}</span>}
              </button>
              {stats.total > 0 && (
                <button
                  type="button"
                  onClick={() => { if (selectMode) clearSelection(); else setSelectMode(true); }}
                  className={`btn btn-sm ${selectMode ? 'btn-primary' : ''}`}
                  aria-pressed={selectMode}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectMode ? t.alicenet.alicenetSelectExit : t.alicenet.alicenetSelect}
                </button>
              )}
              <CardDensitySlider scope="aliceNet" className="min-w-[14rem] max-w-full flex-1 lg:flex-none" />
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted sm:col-span-2 lg:col-span-1">
              {t.alicenet.alicenetFilterProducer}
              <select value={producerFilter} onChange={(e) => setProducerFilter(e.target.value)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                <option value="">{t.alicenet.alicenetFilterProducerAll}</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetYearMin}
              <input value={yearMin} onChange={(e) => setYearMin(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="1999" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetYearMax}
              <input value={yearMax} onChange={(e) => setYearMax(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="2026" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetPriceMin}
              <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="0" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.alicenet.alicenetPriceMax}
              <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="5000" />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-5">
              <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0} className="btn btn-sm">
                <RotateCcw className="h-3.5 w-3.5" />
                {t.alicenet.alicenetResetFilters}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <span className="text-sm font-semibold text-white">
            {t.alicenet.alicenetSelectedCount.replace('{n}', String(selected.size))}
          </span>
          <button type="button" onClick={selectAllVisible} className="btn btn-sm">
            <CheckSquare className="h-3.5 w-3.5" />
            {t.alicenet.alicenetSelectAll}
          </button>
          <button type="button" onClick={selectMatchedVisible} className="btn btn-sm">
            <Link2 className="h-3.5 w-3.5" />
            {t.alicenet.alicenetSelectMatched}
          </button>
          <button type="button" onClick={clearSelection} className="btn btn-sm">
            <X className="h-3.5 w-3.5" />
            {t.alicenet.alicenetClearSelection}
          </button>
        </div>
      )}

      {lastRun && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          lastRun.error
            ? 'border-status-dropped/40 bg-status-dropped/10 text-status-dropped'
            : 'border-border bg-bg-card text-muted'
        }`}>
          <div className="font-semibold text-white">{lastRun.label}</div>
          <div className="mt-1 text-xs">
            {lastRun.error
              ? lastRun.error
              : t.alicenet.alicenetLastRunSummary
                .replace('{processed}', String(lastRun.processed))
                .replace('{matched}', String(lastRun.matched))}
          </div>
        </div>
      )}

      {(filter === 'unmatched' || filter === 'none_found' || filter === 'egs_only') && (stats.none_found > 0 || stats.egs_only > 0) && (
        <div className="mb-4 grid gap-2 rounded-xl border border-border bg-bg-card p-3 md:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => runSingleOp('retrying')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <Search className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.alicenet.alicenetRetryNone}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('vndb-from-egs')} disabled={isBusy || stats.egs_only === 0} className="btn btn-sm justify-start">
            <Link2 className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.alicenet.alicenetMatchVndbFromEgs}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('search-egs')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.alicenet.alicenetSearchEgsForNoVndb}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('search-egs-aggressive')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.alicenet.alicenetSearchEgsForNoVndbAggressive}</span>
          </button>
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div
          aria-busy
          aria-live="polite"
          role="status"
          className={view === 'cards' ? 'grid gap-3' : 'space-y-2'}
          style={view === 'cards' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' } : undefined}
        >
          <span className="sr-only">{t.common.loading}</span>
          {Array.from({ length: view === 'cards' ? 12 : 10 }).map((_, i) => (
            <SkeletonBlock key={i} className={`${view === 'cards' ? 'h-96' : 'h-24'} rounded-xl`} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {stats.total === 0 ? (
            <p>{t.alicenet.alicenetEmptyNoStock ?? t.alicenet.alicenetUnmatched}</p>
          ) : (
            <p>{t.alicenet.alicenetEmptyForFilter ?? t.alicenet.alicenetUnmatched}</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {view === 'cards' && sorted.length > VIRTUAL_GRID_THRESHOLD && (
            <p className="text-right text-[11px] text-muted">
              {t.alicenet.alicenetVirtualScrollNotice.replace('{n}', new Intl.NumberFormat(BCP47[locale]).format(sorted.length))}
            </p>
          )}
          {grouped.map((section) => (
            <section key={section.key || 'all'} className="space-y-2">
              {group !== 'none' && (
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <h2 className="min-w-0 truncate text-sm font-semibold">{section.key}</h2>
                  <span className="rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">{section.items.length}</span>
                </div>
              )}
              {view === 'cards' ? (
                <AliceNetCardGrid items={section.items} renderCard={renderAliceNetCard} />
              ) : (
                <AliceNetRowList items={section.items} renderRow={renderAliceNetRow} />
              )}
            </section>
          ))}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div
          className="fixed bottom-16 left-1/2 z-50 w-[min(96vw,720px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-2 shadow-card backdrop-blur sm:bottom-4 sm:p-3"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-sm font-bold">
              {t.alicenet.alicenetSelectedCount.replace('{n}', String(selected.size))}
            </span>
            <button type="button" className="btn" onClick={clearSelection} disabled={bulkBusy}>
              <X className="h-4 w-4" /> {t.alicenet.alicenetClearSelection}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={bulkClearLinks}
              disabled={bulkBusy}
            >
              <Trash2 className="h-4 w-4" /> {t.alicenet.alicenetBulkClearLink}
            </button>
          </div>
          {bulkBusy && (
            <div className="mt-2" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                <span className="font-semibold text-white">{t.alicenet.alicenetBulkClearLink}</span>
                {bulkProgress.current && (
                  <span className="font-mono">{t.alicenet.alicenetCurrentItem.replace('{item}', bulkProgress.current)}</span>
                )}
                <span className="tabular-nums">{bulkProgress.done}/{bulkProgress.total}</span>
                <button
                  type="button"
                  className="ml-auto inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs font-semibold text-muted hover:border-status-dropped hover:text-status-dropped"
                  onClick={stopBulkClear}
                >
                  {t.alicenet.alicenetStopMatch}
                </button>
              </div>
              <div
                role="progressbar"
                aria-valuenow={bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.alicenet.alicenetBulkClearLink}
                className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-elev"
              >
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {linkTarget && (
        <AliceNetLinkDialog item={linkTarget} onClose={() => setLinkTarget(null)} onLinked={load} />
      )}
    </DensityScopeProvider>
  );
}

interface AliceNetGridMeasurements {
  width: number;
  scrollY: number;
  viewportHeight: number;
  containerTop: number;
  densityPx: number;
}

const ALICENET_DEFAULT_MEASUREMENTS: AliceNetGridMeasurements = {
  width: VIRTUAL_GRID_DEFAULT_WIDTH,
  scrollY: 0,
  viewportHeight: VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT,
  containerTop: 0,
  densityPx: 220,
};

function sameAliceNetMeasurements(a: AliceNetGridMeasurements, b: AliceNetGridMeasurements): boolean {
  return a.width === b.width &&
    a.scrollY === b.scrollY &&
    a.viewportHeight === b.viewportHeight &&
    a.containerTop === b.containerTop &&
    a.densityPx === b.densityPx;
}

const ALICENET_GRID_GAP_PX = 12;

/**
 * Window-renders the alicenet card grid so a large unmatched-stock list
 * stays responsive. Mirrors the LibraryClient `Grid` approach: measure
 * the auto-fill grid on scroll/resize, compute the visible row slice
 * via `calculateVirtualGridWindow`, and render top/bottom spacers so
 * every item remains scroll-reachable. Below the threshold every item
 * renders directly with no measurement cost.
 */
function AliceNetCardGrid({ items, renderCard }: { items: AliceNetItem[]; renderCard: (item: AliceNetItem) => React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureFrameRef = useRef<number | null>(null);
  const [measurements, setMeasurements] = useState<AliceNetGridMeasurements>(ALICENET_DEFAULT_MEASUREMENTS);
  const measureGrid = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next: AliceNetGridMeasurements = {
        width: Math.max(0, Math.round(rect.width)),
        scrollY: Math.max(0, Math.round(window.scrollY)),
        viewportHeight: Math.max(0, Math.round(window.innerHeight)),
        containerTop: Math.round(rect.top + window.scrollY),
        densityPx: parseCssPixelValue(getComputedStyle(el).getPropertyValue('--card-density-px'), 220),
      };
      setMeasurements((prev) => (sameAliceNetMeasurements(prev, next) ? prev : next));
    });
  }, []);
  useEffect(() => {
    if (items.length <= VIRTUAL_GRID_THRESHOLD) return;
    const el = containerRef.current;
    if (!el) return;
    measureGrid();
    window.addEventListener('scroll', measureGrid, { passive: true });
    window.addEventListener('resize', measureGrid);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureGrid);
    observer?.observe(el);
    return () => {
      window.removeEventListener('scroll', measureGrid);
      window.removeEventListener('resize', measureGrid);
      observer?.disconnect();
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
    };
  }, [items.length, measureGrid]);
  const virtual = useMemo(
    () => calculateVirtualGridWindow({
      itemCount: items.length,
      width: measurements.width,
      scrollY: measurements.scrollY,
      viewportHeight: measurements.viewportHeight,
      containerTop: measurements.containerTop,
      densityPx: measurements.densityPx,
      densityMultiplier: 1,
      gapPx: ALICENET_GRID_GAP_PX,
    }),
    [items.length, measurements],
  );
  const renderedItems = useMemo(
    () => (virtual.enabled ? items.slice(virtual.startIndex, virtual.endIndex) : items),
    [items, virtual.enabled, virtual.endIndex, virtual.startIndex],
  );
  return (
    <div
      ref={containerRef}
      role="list"
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      data-virtualized-alicenet-grid={virtual.enabled ? true : undefined}
      aria-rowcount={virtual.enabled ? virtual.totalRows : undefined}
    >
      {virtual.enabled && virtual.topSpacer > 0 && (
        <div aria-hidden style={{ gridColumn: '1 / -1', height: virtual.topSpacer }} />
      )}
      {renderedItems.map(renderCard)}
      {virtual.enabled && virtual.bottomSpacer > 0 && (
        <div aria-hidden style={{ gridColumn: '1 / -1', height: virtual.bottomSpacer }} />
      )}
    </div>
  );
}

const ALICENET_ROW_HEIGHT_PX = 104;
const ALICENET_ROW_GAP_PX = 8;
const ALICENET_ROW_OVERSCAN = 6;

/**
 * Window-renders the alicenet list view by row. Rows have a near-uniform
 * height, so a fixed-height estimate plus overscan keeps scrolling
 * smooth without per-row measurement. Top/bottom spacers preserve the
 * scrollbar so nothing is silently dropped; below the threshold every
 * row renders directly.
 */
function AliceNetRowList({ items, renderRow }: { items: AliceNetItem[]; renderRow: (item: AliceNetItem) => React.ReactNode }) {
  const containerRef = useRef<HTMLUListElement>(null);
  const frameRef = useRef<number | null>(null);
  const [range, setRange] = useState({ start: 0, end: items.length });
  const measure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const containerTop = rect.top + window.scrollY;
      const rowStride = ALICENET_ROW_HEIGHT_PX + ALICENET_ROW_GAP_PX;
      const viewportTop = Math.max(0, window.scrollY - containerTop);
      const viewportBottom = viewportTop + window.innerHeight;
      const start = Math.max(0, Math.floor(viewportTop / rowStride) - ALICENET_ROW_OVERSCAN);
      const end = Math.min(items.length, Math.ceil(viewportBottom / rowStride) + ALICENET_ROW_OVERSCAN);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    });
  }, [items.length]);
  useEffect(() => {
    if (items.length <= VIRTUAL_GRID_THRESHOLD) {
      setRange({ start: 0, end: items.length });
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [items.length, measure]);
  const enabled = items.length > VIRTUAL_GRID_THRESHOLD;
  const start = enabled ? range.start : 0;
  const end = enabled ? range.end : items.length;
  const rowStride = ALICENET_ROW_HEIGHT_PX + ALICENET_ROW_GAP_PX;
  const topSpacer = enabled ? start * rowStride : 0;
  const bottomSpacer = enabled ? Math.max(0, (items.length - end) * rowStride) : 0;
  const rendered = enabled ? items.slice(start, end) : items;
  return (
    <ul ref={containerRef} className="space-y-2">
      {topSpacer > 0 && <li aria-hidden style={{ height: topSpacer }} />}
      {rendered.map(renderRow)}
      {bottomSpacer > 0 && <li aria-hidden style={{ height: bottomSpacer }} />}
    </ul>
  );
}
