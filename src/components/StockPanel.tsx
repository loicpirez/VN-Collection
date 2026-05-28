'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  PackageSearch,
  Plus,
  RefreshCw,
  ShoppingBag,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';
import { timeAgo } from '@/lib/time-ago';
import { normalizeProviderDiagnostic, type NormalizedProviderDiagnostic, type ProviderDiagnosticGroup } from '@/lib/stock-diagnostics';
import { classifyOfferGroup, isEligibleGameStockOffer, type OfferGroup } from '@/lib/stock-classify';
import { ONLINE_STOCK_SENTINEL } from '@/lib/stock-provider-constants';
import { StockPhysicalLocations, type PhysicalOffer } from './StockPhysicalLocations';
// R12-EROGEPRICE-UI: lazy-load so the line-chart SVG + the per-
// candidate panel never ship to operators who never open a VN with
// eroge_price data. ~12 KB gz delta.
const ErogePricePanel = dynamic(() => import('./ErogePricePanel').then((m) => m.ErogePricePanel), { ssr: false });
import { SkeletonRows } from './Skeleton';
import { useDialogA11y } from './Dialog';
import { useConfirm } from './ConfirmDialog';

interface StockOffer {
  vn_id: string;
  provider: string;
  provider_label: string;
  provider_offer_id: string;
  source: string;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown' | 'error';
  availability_label: string | null;
  condition: string | null;
  edition_label: string | null;
  location_label: string | null;
  location_branch: string | null;
  source_release_id: string | null;
  jan: string | null;
  fetched_at: number;
  error: string | null;
  // Classification fields (null for legacy offers pre-schema-migration)
  content_kind: string | null;
  platform: string | null;
  edition_kind: string | null;
  series_relation: string | null;
  match_confidence: string | null;
  match_score: number | null;
  match_warnings_json: string | null;
  marketplace_price: number | null;
  marketplace_count: number | null;
  list_price: number | null;
  category: string | null;
  store_code: string | null;
  product_id: string | null;
  page_kind: string | null;
}

interface StockStatus {
  provider: string;
  status: 'ok' | 'no_results' | 'partial' | 'protected' | 'error' | 'skipped' | 'not_checked';
  message: string | null;
  fetched_at: number;
  offer_count: number;
  blocked_kind: string | null;
  fresh_offers_found: number;
  cached_offers_available: number;
  /** Provider-specific JSON blob (eroge_price game bundles, etc.). */
  extras_json?: string | null;
}

interface StockProvider {
  id: string;
  label: string;
  kind: 'direct' | 'aggregate' | 'cached';
  physical: boolean;
  physicalStockMode: string;
  cloudflare: boolean;
  branchParserImplemented: boolean;
  confirmedPhysicalUsable: boolean;
}

interface StockSnapshot {
  offers: StockOffer[];
  statuses: StockStatus[];
  providers: StockProvider[];
  sources: StockSource[];
  summary: {
    total: number;
    available: number;
    best_price: number | null;
    related_available: number;
    needs_review: number;
    rejected: number;
    last_refresh: number | null;
  };
}

interface StockSource {
  id: number;
  vn_id: string;
  release_id: string | null;
  provider: string;
  url: string;
  product_id: string | null;
  created_at: number;
  updated_at: number;
}

// P-200: STALE_MS used to live inside the component body; hoist to
// module scope so the literal isn't recreated on every render.
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

// P-025 / P-027: module-level EMPTY arrays so consumers can use a
// stable reference for the "no snapshot yet" case. Used directly
// in useMemo deps; avoids re-creating a fresh `[]` on every render
// when the snapshot fields are undefined.
const EMPTY_OFFERS: StockOffer[] = [];
const EMPTY_PROVIDERS: StockProvider[] = [];

export function StockPanel({
  vnId,
  title,
  dense = false,
  initialSnapshot,
}: {
  vnId: string;
  title?: string;
  dense?: boolean;
  initialSnapshot?: StockSnapshot;
}) {
  const t = useT();
  const locale = useLocale();
  const { confirm } = useConfirm();
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [hideStale, setHideStale] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const physicalDefaultRef = useRef(false);

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }),
    [locale],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, { cache: 'no-store', signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = (await r.json()) as StockSnapshot;
        if (!signal?.aborted) setSnapshot(data);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || signal?.aborted) return;
        setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [vnId, t.common.error],
  );

  useEffect(() => {
    if (initialSnapshot) return;
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, initialSnapshot]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { aliases: [] }))
      .then((data: { aliases: string[] }) => { if (!ctrl.signal.aborted) setAliases(data.aliases ?? []); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') {/* swallow */} });
    return () => ctrl.abort();
  }, [vnId]);

  // P-027: stabilize providers reference so downstream useMemos don't
  // re-compute on every render when the snapshot fields are undefined.
  const providers = snapshot?.providers ?? EMPTY_PROVIDERS;

  useEffect(() => {
    if (initialSnapshot || physicalDefaultRef.current || providers.length === 0) return;
    physicalDefaultRef.current = true;
    const physicalIds = providers.filter((p) => p.physical && p.kind !== 'cached').map((p) => p.id);
    if (physicalIds.length > 0) setSelectedProviders(physicalIds);
  }, [initialSnapshot, providers.length]);

  async function refresh() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    setError(null);

    const toCheck = selectedProviders ?? refreshableProviders.map((p) => p.id);
    setProgress({ done: 0, total: toCheck.length });
    setCurrentProvider(null);

    for (let i = 0; i < toCheck.length; i++) {
      if (ctrl.signal.aborted) break;
      const provider = toCheck[i];
      setCurrentProvider(provider);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providers: [provider] }),
          signal: ctrl.signal,
        });
        if (r.ok) setSnapshot((await r.json()) as StockSnapshot);
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
      }
      setProgress({ done: i + 1, total: toCheck.length });
    }

    setCurrentProvider(null);
    if (abortRef.current === ctrl) abortRef.current = null;
    setRefreshing(false);
    setLoading(false);
  }

  /**
   * Single-provider refresh — surfaced as a per-tile button so the
   * operator can re-check just one shop without re-running the entire
   * lineup. Same wire shape as the bulk refresh, just constrained to
   * one provider.
   */
  async function refreshOnlyProvider(provider: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    setError(null);
    setProgress({ done: 0, total: 1 });
    setCurrentProvider(provider);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: [provider] }),
        signal: ctrl.signal,
      });
      if (r.ok) setSnapshot((await r.json()) as StockSnapshot);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
    setProgress({ done: 1, total: 1 });
    setCurrentProvider(null);
    if (abortRef.current === ctrl) abortRef.current = null;
    setRefreshing(false);
    setLoading(false);
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRefreshing(false);
  }

  async function handleAddAlias(e: React.FormEvent) {
    e.preventDefault();
    const term = aliasInput.trim();
    if (!term || aliasLoading) return;
    setAliasLoading(true);
    setAliasError(null);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, action: 'add' }),
      });
      const data = (await r.json()) as { aliases?: string[]; error?: string };
      if (r.ok) {
        setAliases(data.aliases ?? []);
        setAliasInput('');
      } else {
        if (Array.isArray(data.aliases)) setAliases(data.aliases);
        setAliasError(data.error ?? t.common.error);
      }
    } catch (e) {
      setAliasError((e as Error).message);
    } finally {
      setAliasLoading(false);
    }
  }

  async function removeAlias(term: string) {
    const ok = await confirm({
      message: t.stock.aliasRemoveConfirm.replace('{term}', term),
      tone: 'danger',
    });
    if (!ok) return;
    setAliasLoading(true);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, action: 'delete' }),
      });
      if (r.ok) {
        const data = (await r.json()) as { aliases: string[] };
        setAliases(data.aliases ?? []);
      } else {
        // P-122: previously swallowed. Surface failure so the user
        // doesn't see the alias quietly remain.
        setAliasError(await readApiError(r, t.common.error));
      }
    } catch (e) {
      setAliasError((e as Error).message);
    } finally {
      setAliasLoading(false);
    }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    const url = sourceInput.trim();
    if (!url || sourceLoading) return;
    setSourceLoading(true);
    setSourceError(null);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.stock.manualSourceUnsupported));
      setSnapshot((await r.json()) as StockSnapshot);
      setSourceInput('');
    } catch (e) {
      setSourceError((e as Error).message);
    } finally {
      setSourceLoading(false);
    }
  }

  async function removeSource(id: number) {
    const ok = await confirm({
      message: t.stock.manualSourceDeleteConfirm,
      tone: 'danger',
    });
    if (!ok) return;
    setSourceLoading(true);
    setSourceError(null);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/sources`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      setSnapshot((await r.json()) as StockSnapshot);
    } catch (e) {
      setSourceError((e as Error).message);
    } finally {
      setSourceLoading(false);
    }
  }

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  function clearCache() {
    setClearConfirmOpen(true);
  }

  async function performClearCache() {
    setClearConfirmOpen(false);
    setClearingCache(true);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, { method: 'DELETE' });
      if (r.ok) {
        const data = (await r.json()) as { snapshot?: StockSnapshot };
        if (data.snapshot) {
          setSnapshot(data.snapshot);
        } else {
          setSnapshot(null);
          await load();
        }
      } else {
        // P-122: surface clear-cache failure so the user knows the
        // operation didn't succeed.
        setError(await readApiError(r, t.common.error));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClearingCache(false);
    }
  }

  // P-021 / P-193: memoize `now` per snapshot. Date.now() at top-of-
  // render would mean the staleProviderIds memo's `now` dep changes on
  // every render, defeating the memo entirely. Re-evaluating staleness
  // once per snapshot is the right granularity — a 7-day staleness
  // threshold doesn't care about a few ms of drift.
  const now = useMemo(() => Date.now(), [snapshot]);
  // P-025: stabilize the empty-snapshot fallback so this reference is
  // the same array across renders.
  const allOffers = snapshot?.offers ?? EMPTY_OFFERS;
  const staleProviderIds = useMemo(() => {
    if (!hideStale) return new Set<string>();
    return new Set(
      (snapshot?.statuses ?? [])
        .filter((s) => now - s.fetched_at > STALE_MS)
        .map((s) => s.provider),
    );
  }, [hideStale, snapshot?.statuses, now]);
  // P-024: memoize the filtered `offers` array so identity is stable
  // when hideStale is false (returns allOffers ref directly) and only
  // changes when the stale set changes. Downstream useMemos that
  // depend on `offers` now actually hit the cache.
  const offers = useMemo(
    () => (hideStale ? allOffers.filter((o) => !staleProviderIds.has(o.provider)) : allOffers),
    [hideStale, allOffers, staleProviderIds],
  );
  const refreshableProviders = providers.filter((p) => p.kind !== 'cached');
  const selectedProviderIds = selectedProviders ?? refreshableProviders.map((p) => p.id);
  const selectedProviderSet = useMemo(() => new Set(selectedProviderIds), [selectedProviderIds]);
  const statusByProvider = useMemo(
    () => new Map((snapshot?.statuses ?? []).map((s) => [s.provider, s])),
    [snapshot?.statuses],
  );
  // R12-EROGEPRICE-UI: pull the persisted eroge-price extras out of
  // the provider-status row and decode the JSON envelope. The blob
  // holds every candidate game's full bundle (detail / priceStats /
  // priceHistory / related). Failures here must not crash the panel
  // — fall back to `null` so the panel just skips the section.
  const erogePriceExtras = useMemo<ErogePriceExtrasV1 | null>(() => {
    const row = statusByProvider.get('eroge_price');
    if (!row || !row.extras_json) return null;
    try {
      const decoded = JSON.parse(row.extras_json) as ErogePriceExtrasV1;
      if (decoded.schemaVersion !== 1 || !Array.isArray(decoded.candidates)) return null;
      return decoded;
    } catch {
      return null;
    }
  }, [statusByProvider]);
  const offerCountByProvider = useMemo(() => {
    const out = new Map<string, number>();
    for (const offer of offers) out.set(offer.provider, (out.get(offer.provider) ?? 0) + 1);
    return out;
  }, [offers]);
  const diagnostics = useMemo(
    () =>
      providers.map((provider) =>
        normalizeProviderDiagnostic(provider, statusByProvider.get(provider.id), offerCountByProvider.get(provider.id) ?? 0),
      ),
    [providers, statusByProvider, offerCountByProvider],
  );
  const diagnosticByProvider = useMemo(() => new Map(diagnostics.map((diag) => [diag.provider, diag])), [diagnostics]);

  const physicalProviderIds = useMemo(
    () => new Set(providers.filter((p) => p.physical && p.kind !== 'cached').map((p) => p.id)),
    [providers],
  );
  const isPhysicalSelection = useMemo(
    () =>
      selectedProviders !== null &&
      selectedProviders.length === physicalProviderIds.size &&
      selectedProviders.every((id) => physicalProviderIds.has(id)),
    [selectedProviders, physicalProviderIds],
  );

  const best = snapshot?.summary.best_price ?? null;
  const lastRefresh = snapshot?.summary.last_refresh ?? null;
  const checkedStatuses = snapshot?.statuses ?? [];
  const displayDiagnostics = diagnostics.filter(
    (diag) =>
      diag.kind !== 'ok' &&
      diag.kind !== 'partial' && // Suruga-ya "Search OK" is a success state — the tile badge already says so.
      (diag.kind !== 'not_checked' || statusByProvider.has(diag.provider)),
  );

  const confirmedPhysicalIds = useMemo(
    () => new Set(providers.filter((p) => p.confirmedPhysicalUsable).map((p) => p.id)),
    [providers],
  );

  const physicalOffers = useMemo((): PhysicalOffer[] =>
    offers.filter(
      (o) =>
        confirmedPhysicalIds.has(o.provider) &&
        (o.availability === 'in_stock' || o.availability === 'limited') &&
        !!o.location_label &&
        // Audit I-027: compare against the machine-readable sentinel,
        // not the English label that used to be persisted directly.
        o.location_label !== ONLINE_STOCK_SENTINEL,
    ).map((o) => ({
      provider: o.provider,
      provider_label: o.provider_label,
      title: o.title,
      url: o.url,
      price: o.price,
      availability: o.availability,
      location_label: o.location_label,
      location_branch: o.location_branch,
      condition: o.condition,
    })),
  [offers, confirmedPhysicalIds]);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const detectedSourceProvider = useMemo(() => {
    const raw = sourceInput.trim();
    if (!raw || providers.length === 0) return null;
    let host = '';
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
    if (!host) return null;
    const match = providers.find((p) => providerHostMatches(p.id, host));
    return match?.label ?? null;
  }, [sourceInput, providers]);

  const blockedProviderCount = useMemo(() => {
    const blockedGroups = new Set<ProviderDiagnosticGroup>(['blocked', 'attention']);
    return refreshableProviders.filter((p) => {
      const diag = diagnosticByProvider.get(p.id);
      return diag ? blockedGroups.has(diag.group) : false;
    }).length;
  }, [refreshableProviders, diagnosticByProvider]);
  const notCheckedCount = useMemo(
    () => refreshableProviders.filter((p) => !statusByProvider.has(p.id)).length,
    [refreshableProviders, statusByProvider],
  );

  function setProviderGroup(kind: 'all' | 'physical' | 'aggregate' | 'blocked' | 'not_checked') {
    if (kind === 'all') {
      setSelectedProviders(null);
      return;
    }
    if (kind === 'physical') {
      const ids = providers.filter((p) => p.physical && p.kind !== 'cached').map((p) => p.id);
      if (ids.length > 0) setSelectedProviders(ids);
      return;
    }
    if (kind === 'blocked') {
      // Select providers currently in blocked/unreachable state so the user
      // can re-check them after a transient issue.
      const blockedGroups: ProviderDiagnosticGroup[] = ['blocked', 'attention'];
      const ids = refreshableProviders
        .map((p) => p.id)
        .filter((id) => {
          const diag = diagnosticByProvider.get(id);
          return diag ? blockedGroups.includes(diag.group) : false;
        });
      if (ids.length > 0) setSelectedProviders(ids);
      return;
    }
    if (kind === 'not_checked') {
      const ids = refreshableProviders
        .map((p) => p.id)
        .filter((id) => !statusByProvider.has(id));
      if (ids.length > 0) setSelectedProviders(ids);
      return;
    }
    const ids = refreshableProviders.filter((p) => p.kind === kind).map((p) => p.id);
    if (ids.length > 0) setSelectedProviders(ids);
  }

  function toggleProvider(id: string) {
    const next = new Set(selectedProviders ?? refreshableProviders.map((p) => p.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    const allIds = refreshableProviders.map((p) => p.id);
    const values = allIds.filter((pid) => next.has(pid));
    setSelectedProviders(values.length === allIds.length ? null : values);
  }

  const checkButtonLabel = refreshing
    ? t.stock.checkingProviders.replace(
        '{count}',
        progress ? `${progress.done}/${progress.total}` : String(selectedProviderIds.length || refreshableProviders.length),
      )
    : isPhysicalSelection
      ? t.stock.checkPhysical
      : t.stock.check;

  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-bg-card ${dense ? 'p-4' : 'p-4 sm:p-5'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1">
          <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <ShoppingBag className="h-4 w-4 text-accent" aria-hidden />
            {t.stock.title}
          </h2>
          {title && <p className="mt-1 break-words text-sm font-semibold text-white">{title}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1">
              <PackageSearch className="h-3 w-3" aria-hidden />
              {t.stock.availableGameCount
                .replace('{available}', String(snapshot?.summary.available ?? 0))
                .replace('{total}', String(snapshot?.summary.total ?? 0))}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1">
              <CircleDollarSign className="h-3 w-3" aria-hidden />
              {best != null ? t.stock.bestGamePrice.replace('{price}', currency.format(best)) : t.stock.noPrice}
            </span>
            {(snapshot?.summary.related_available ?? 0) > 0 && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-1">
                {t.stock.relatedAvailableCount.replace('{count}', String(snapshot?.summary.related_available ?? 0))}
              </span>
            )}
            {(snapshot?.summary.needs_review ?? 0) > 0 && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-1">
                {t.stock.needsReviewCount.replace('{count}', String(snapshot?.summary.needs_review ?? 0))}
              </span>
            )}
            {(snapshot?.summary.rejected ?? 0) > 0 && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-1">
                {t.stock.rejectedCount.replace('{count}', String(snapshot?.summary.rejected ?? 0))}
              </span>
            )}
            {lastRefresh && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-1">
                {t.stock.lastChecked.replace('{date}', new Date(lastRefresh).toLocaleString(locale))}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-status-dropped/50 bg-status-dropped/10 px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/20"
            >
              <Square className="h-3.5 w-3.5" aria-hidden /> {t.stock.stop}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setHideStale((h) => !h)}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-bold ${
              hideStale
                ? 'border-status-on_hold/50 bg-status-on_hold/10 text-status-on_hold hover:bg-status-on_hold/20'
                : 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
            }`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {hideStale ? (t.stock.showStale as string) : (t.stock.hideStale as string)}
          </button>
          <button
            type="button"
            onClick={clearCache}
            disabled={clearingCache || refreshing}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-status-dropped/40 bg-bg px-3 py-1.5 text-xs font-bold text-status-dropped/70 hover:border-status-dropped hover:bg-status-dropped/10 disabled:opacity-50"
          >
            {clearingCache ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
            {t.stock.clearCache as string}
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || (selectedProviders != null && selectedProviders.length === 0)}
            className="btn btn-primary min-h-[44px]"
            aria-busy={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {checkButtonLabel}
          </button>
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {refreshing && progress
          ? (t.stock.checkingProviders as string).replace('{count}', `${progress.done}/${progress.total}`)
          : ''}
      </p>

      {providers.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-bg-elev/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">{t.stock.providers}</h3>
            <span className="text-[11px] text-muted">
              {t.stock.providerSelectedCount
                .replace('{selected}', String(selectedProviderIds.length))
                .replace('{total}', String(refreshableProviders.length))}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <GroupBtn
              label={t.stock.groupPhysical}
              active={isPhysicalSelection}
              onClick={() => setProviderGroup('physical')}
              disabled={refreshing}
            />
            <GroupBtn
              label={t.stock.providersAll}
              active={selectedProviders === null}
              onClick={() => setProviderGroup('all')}
              disabled={refreshing}
            />
            <GroupBtn
              label={t.stock.providersAggregate}
              active={
                selectedProviders !== null &&
                selectedProviders.every((id) => providerById.get(id)?.kind === 'aggregate')
              }
              onClick={() => setProviderGroup('aggregate')}
              disabled={refreshing}
            />
            {blockedProviderCount > 0 && (
              <GroupBtn
                label={(t.stock.groupBlockedRetry as string).replace('{count}', String(blockedProviderCount))}
                active={false}
                onClick={() => setProviderGroup('blocked')}
                disabled={refreshing}
              />
            )}
            {notCheckedCount > 0 && (
              <GroupBtn
                label={(t.stock.groupNotCheckedSelect as string).replace('{count}', String(notCheckedCount))}
                active={false}
                onClick={() => setProviderGroup('not_checked')}
                disabled={refreshing}
              />
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label={t.stock.providers}>
            {providers.map((provider) => {
              const status = statusByProvider.get(provider.id);
              const count = offerCountByProvider.get(provider.id) ?? status?.offer_count ?? 0;
              const diagnostic = diagnosticByProvider.get(provider.id);
              const selectable = provider.kind !== 'cached';
              const selected = selectable ? selectedProviderSet.has(provider.id) : false;
              const badgeLabel = diagnostic ? providerDiagnosticText(t, diagnostic.badgeKey) : null;
              const lastChecked = status?.fetched_at
                ? timeAgo(status.fetched_at, t)
                : null;
              const lastCheckedFull = status?.fetched_at
                ? new Date(status.fetched_at).toLocaleString(locale)
                : null;
              const ariaLabel = `${provider.label} — ${badgeLabel ?? (selectable ? t.stock.providerNotChecked : t.stock.providerCached)}${count > 0 ? ` (${count})` : ''}`;
              const diagnosticMessage = diagnostic ? providerDiagnosticText(t, diagnostic.messageKey) : null;
              const tooltipParts: string[] = [];
              if (diagnosticMessage && diagnostic?.kind !== 'ok') tooltipParts.push(diagnosticMessage);
              if (lastCheckedFull) tooltipParts.push((t.stock.lastChecked as string).replace('{date}', lastCheckedFull));
              const isRefreshingThis = refreshing && currentProvider === provider.id;
              return (
                <div
                  key={provider.id}
                  className={`group relative min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10 text-white'
                      : selectable
                        ? 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
                        : 'border-border bg-bg/60 text-muted opacity-80'
                  }`}
                  title={tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined}
                >
                  <button
                    type="button"
                    onClick={() => selectable && toggleProvider(provider.id)}
                    disabled={refreshing || !selectable}
                    aria-pressed={selected}
                    aria-label={ariaLabel}
                    className="block w-full min-w-0 text-left"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold">{provider.label}</span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
                          {provider.kind === 'cached'
                            ? t.stock.providerCached
                            : provider.kind === 'aggregate'
                              ? t.stock.providersAggregate
                              : provider.confirmedPhysicalUsable
                                ? t.stock.groupPhysical
                                : provider.physical
                                  ? t.stock.physicalCapable
                                  : t.stock.providersDirect}
                        </span>
                        {lastChecked && (
                          <span className="mt-0.5 block text-[10px] text-muted/70">
                            {(t.stock.lastCheckedShort as string).replace('{time}', lastChecked)}
                          </span>
                        )}
                      </span>
                      <ProviderStatusBadge
                        t={t}
                        diagnostic={diagnostic}
                        count={count}
                        cached={provider.kind === 'cached'}
                        loading={isRefreshingThis}
                      />
                    </span>
                  </button>
                  {selectable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshOnlyProvider(provider.id);
                      }}
                      disabled={refreshing}
                      aria-label={(t.stock.refreshOnlyProvider as string).replace('{provider}', provider.label)}
                      title={(t.stock.refreshOnlyProvider as string).replace('{provider}', provider.label)}
                      className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md border border-border bg-bg text-muted hover:border-accent hover:text-accent focus:flex group-hover:flex group-focus-within:flex disabled:opacity-40"
                    >
                      {isRefreshingThis ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-3 w-3" aria-hidden />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-bg-elev/25 p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
          <Tag className="h-3 w-3" aria-hidden />
          {t.stock.aliases}
        </h3>
        <p className="mt-1 text-[11px] text-muted">{t.stock.aliasHint}</p>
        {aliases.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {aliases.map((alias) => (
              <span
                key={alias}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-white"
              >
                <span className="inline-block max-w-[12rem] truncate align-bottom">{alias}</span>
                <button
                  type="button"
                  onClick={() => removeAlias(alias)}
                  disabled={aliasLoading}
                  aria-label={t.stock.aliasRemoveTerm}
                  className="tap-target rounded p-0.5 text-muted hover:text-status-dropped disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleAddAlias} className="mt-2 flex gap-2">
          <input
            type="text"
            value={aliasInput}
            onChange={(e) => { setAliasInput(e.target.value); if (aliasError) setAliasError(null); }}
            placeholder={t.stock.aliasPlaceholder}
            aria-label={t.stock.aliasPlaceholder}
            aria-invalid={aliasError ? true : undefined}
            aria-describedby={aliasError ? 'stock-alias-error' : undefined}
            maxLength={100}
            className="min-h-[36px] flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-white placeholder-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!aliasInput.trim() || aliasLoading}
            className="btn btn-primary text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t.stock.aliasAdd}
          </button>
        </form>
        {aliasError && (
          <p id="stock-alias-error" role="alert" className="mt-2 text-xs text-status-dropped">{aliasError}</p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-bg-elev/25 p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
          <ExternalLink className="h-3 w-3" aria-hidden />
          {t.stock.manualSources}
        </h3>
        <p className="mt-1 text-[11px] text-muted">{t.stock.manualSourceHint}</p>
        {(snapshot?.sources ?? []).length > 0 && (
          <ul className="mt-2 space-y-1">
            {(snapshot?.sources ?? []).map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-2 py-1.5 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded bg-bg-elev px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    {providerDisplayName(providers, source.provider)}
                  </span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-white hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    title={source.url}
                  >
                    {source.product_id ?? source.url}
                  </a>
                </span>
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  disabled={sourceLoading}
                  aria-label={`${t.stock.manualSourceDelete} — ${providerDisplayName(providers, source.provider)}`}
                  className="rounded p-0.5 text-muted hover:text-status-dropped focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAddSource} className="mt-2 flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={sourceInput}
            onChange={(e) => { setSourceInput(e.target.value); if (sourceError) setSourceError(null); }}
            placeholder={t.stock.manualSourcePlaceholder}
            aria-label={t.stock.manualSourcePlaceholder}
            aria-invalid={sourceError ? true : undefined}
            aria-describedby={sourceError ? 'stock-source-error' : undefined}
            maxLength={1024}
            className="min-h-[36px] flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-white placeholder-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!sourceInput.trim() || sourceLoading}
            className="btn btn-primary text-xs"
          >
            {sourceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {t.stock.manualSourceAdd}
          </button>
        </form>
        {detectedSourceProvider && (
          <p className="mt-1 text-[10px] text-muted">
            {(t.stock.manualSourceDetected as string).replace('{provider}', detectedSourceProvider)}
          </p>
        )}
        {sourceError && (
          <p id="stock-source-error" role="alert" className="mt-2 text-xs text-status-dropped">{sourceError}</p>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-3 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-4">
          <SkeletonRows count={3} withThumb={false} />
        </div>
      )}

      {!loading && lastRefresh != null && (now - lastRefresh > STALE_MS) && offers.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs text-status-on_hold" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-on_hold" aria-hidden />
          <span>
            {(t.stock.staleBanner as string).replace('{ago}', timeAgo(lastRefresh, t))}
          </span>
        </div>
      )}

      {!loading && offers.length === 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-border bg-bg-elev/30 p-4 text-sm text-muted">
          <PackageSearch className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p>{checkedStatuses.length > 0 ? t.stock.emptyAfterCheck : t.stock.empty}</p>
            {checkedStatuses.length === 0 && (
              <p className="mt-1 text-[11px] text-muted/80">
                {(t.stock.emptyHint as string).replace('{count}', String(refreshableProviders.length))}
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && offers.length > 0 && (
        <OffersGrouped offers={offers} best={best} currency={currency} t={t} locale={locale} />
      )}

      {!loading && confirmedPhysicalIds.size > 0 && (
        <StockPhysicalLocations offers={physicalOffers} />
      )}

      {/* R12-EROGEPRICE-UI: render the full Eroge Price bundle —
          multi-candidate tabs, identity card, all-time / 30-day stats,
          full price-history line chart, per-edition retailer rows,
          staff / voice actors, related games. The data is the
          extras_json blob stored on `vn_stock_provider_status` for the
          eroge_price provider. Lazy-loaded so the whole graph chunk
          doesn't ride along with every StockPanel mount. */}
      {!loading && erogePriceExtras && <ErogePricePanel vnId={vnId} extras={erogePriceExtras} />}

      {!loading && displayDiagnostics.length > 0 && (
        <ProviderDiagnostics diagnostics={displayDiagnostics} t={t} />
      )}

      {clearConfirmOpen && (
        <ClearCacheModal
          t={t}
          onCancel={() => setClearConfirmOpen(false)}
          onConfirm={performClearCache}
        />
      )}
    </section>
  );
}

function ClearCacheModal({
  t,
  onCancel,
  onConfirm,
}: {
  t: TDict;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: true, onClose: onCancel, panelRef });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-xl border border-border bg-bg-card p-4 shadow-xl outline-none"
      >
        <h2 id={titleId} className="text-sm font-bold text-white">
          {t.stock.clearCache as string}
        </h2>
        <p className="mt-2 text-xs text-muted">{t.stock.clearCacheConfirm as string}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t.common.cancel as string}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] rounded-md border border-status-dropped/50 bg-status-dropped/15 px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped"
          >
            {t.stock.clearCache as string}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupBtn({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className={`min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
      }`}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function availabilityLabel(t: ReturnType<typeof useT>, offer: StockOffer, locale: string): string {
  if (offer.availability_label) return stockAvailabilityLabel(t, offer.availability_label, locale);
  return t.stock.availability[offer.availability];
}

function stockSourceLabel(t: ReturnType<typeof useT>, source: string): string {
  if (source === 'direct') return t.stock.sourceLabels.direct;
  if (source === 'search') return t.stock.sourceLabels.search;
  if (source === 'manual') return t.stock.sourceLabels.manual;
  if (source === 'alicesoft_kobe') return t.stock.sourceLabels.cached;
  return source;
}

/**
 * I-007: translate the slug-keyed warnings emitted by stock-classify.
 * Legacy DB rows still carry the old English wording — map them back
 * to slugs before resolving via the dict so the chip is localised
 * regardless of when the row was written.
 */
const LEGACY_WARNING_MAP: Record<string, string> = {
  'bonus-only item': 'bonus_only_item',
  'related music/media': 'related_music_media',
  'related goods title': 'related_goods_title',
  'related goods category': 'related_goods_category',
  'only mentions target inside bonus description': 'only_mentions_target_in_bonus',
  'same series but different game': 'same_series_different_game',
};

function stockWarningLabel(t: ReturnType<typeof useT>, raw: string): string {
  const slug = LEGACY_WARNING_MAP[raw] ?? raw;
  const dict = t.stock.matchWarnings as Record<string, string | undefined>;
  return dict[slug] ?? raw;
}

/**
 * Legacy server-side edition labels (English) → slug. New stock rows
 * may already carry the slug; both shapes resolve via the dict.
 */
const LEGACY_EDITION_LABEL_MAP: Record<string, string> = {
  'Bonus item': 'bonus_item',
  'First press': 'first_press',
  'Complete limited': 'complete_limited',
  'Limited edition': 'limited_edition',
  'Deluxe edition': 'deluxe_edition',
  'Bundle': 'bundle',
  'Store bonus': 'store_bonus',
};

const LEGACY_CONDITION_MAP: Record<string, string> = {
  'New': 'new',
  'Used': 'used',
  'Sealed': 'sealed',
};

const LEGACY_AVAILABILITY_LABEL_MAP: Record<string, string> = {
  'Sold out': 'sold_out',
  'Several': 'several',
  'AliceNet Kobe stock': 'alicesoft_kobe_stock',
};

function stockEditionLabel(t: ReturnType<typeof useT>, raw: string): string {
  const slug = LEGACY_EDITION_LABEL_MAP[raw] ?? raw;
  const dict = t.stock.editionLabels as Record<string, string | undefined>;
  return dict[slug] ?? raw;
}

function stockConditionLabel(t: ReturnType<typeof useT>, raw: string): string {
  const slug = LEGACY_CONDITION_MAP[raw] ?? raw;
  const dict = t.stock.conditionLabels as Record<string, string | undefined>;
  return dict[slug] ?? raw;
}

function stockAvailabilityLabel(
  t: ReturnType<typeof useT>,
  raw: string,
  locale: string,
): string {
  const marketplaceMatch = /^Marketplace:\s*¥(\d[\d,]*)$/.exec(raw);
  if (marketplaceMatch) {
    const price = Number(marketplaceMatch[1].replace(/,/g, ''));
    const dict = t.stock.availabilityLabels as Record<string, string | undefined>;
    const tpl = dict.marketplace;
    if (tpl) {
      return tpl.replace('{price}', `¥${price.toLocaleString(locale)}`);
    }
  }
  const slug = LEGACY_AVAILABILITY_LABEL_MAP[raw] ?? raw;
  const dict = t.stock.availabilityLabels as Record<string, string | undefined>;
  return dict[slug] ?? raw;
}

function providerDisplayName(providers: StockProvider[], providerId: string): string {
  return providers.find((p) => p.id === providerId)?.label ?? providerId;
}

/**
 * Client-side mirror of PROVIDER_HOSTS in stock.ts — used to live-preview the
 * detected provider while the user types a manual source URL. Server-side
 * canonicalisation still re-validates the URL via the API route.
 */
const CLIENT_PROVIDER_HOST_PATTERNS: ReadonlyArray<[providerId: string, pattern: RegExp]> = [
  ['eroge_price', /^eroge-price\.com$/],
  ['sofmap', /(^|\.)sofmap\.com$/],
  ['surugaya', /(^|\.)suruga-ya\.(jp|com)$/],
  ['hgame1', /^www\.hgame1\.com$/],
  ['melonbooks', /^www\.melonbooks\.co\.jp$/],
  ['mandarake', /(^|\.)mandarake\.co\.jp$/],
  ['wondergoo', /^www\.wonder\.co\.jp$/],
  ['trader', /(^|\.)(?:trader\.co\.jp|chuko-tsuhan\.com)$/],
  ['animate', /^www\.animate-onlineshop\.jp$/],
  ['ebten', /^store\.kadokawa\.co\.jp$/],
  ['getchu', /^www\.getchu\.com$/],
  ['gamers', /^www\.gamers\.co\.jp$/],
  ['gamecity', /^shop\.gamecity\.ne\.jp$/],
  ['asakusa_mach', /^shopping\.yahoo\.co\.jp$/],
  ['amazon_jp', /^www\.amazon\.co\.jp$/],
  ['amiami', /^www\.amiami\.jp$/],
  ['otakarasouko', /^www\.ec\.otakarasouko\.com$/],
  ['geo', /^ec\.geo-online\.co\.jp$/],
  ['joshin', /^joshinweb\.jp$/],
  ['neowing', /^www\.neowing\.co\.jp$/],
  ['yodobashi', /^www\.yodobashi\.com$/],
  ['bikkuri_takarajima', /^beak-takarajima\.celosia\.co\.jp$/],
];

function providerHostMatches(providerId: string, host: string): boolean {
  const entry = CLIENT_PROVIDER_HOST_PATTERNS.find(([id]) => id === providerId);
  return entry ? entry[1].test(host) : false;
}

function ProviderStatusBadge({
  t,
  diagnostic,
  count,
  cached,
  loading = false,
}: {
  t: ReturnType<typeof useT>;
  diagnostic: NormalizedProviderDiagnostic | undefined;
  count: number;
  cached: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden />;
  }
  if (cached && (!diagnostic || diagnostic.kind === 'not_checked')) {
    return <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">{count}</span>;
  }
  if (!diagnostic || diagnostic.kind === 'not_checked') {
    return (
      <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">
        {t.stock.providerNotChecked}
      </span>
    );
  }
  const cls = diagnosticToneClass(diagnostic.tone);
  const label = providerDiagnosticText(t, diagnostic.badgeKey);
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function providerDiagnosticText(t: TDict, key: string): string {
  const dict = t.stock.providerDiagnostics as Record<string, string> | undefined;
  return dict?.[key] ?? key;
}

function diagnosticToneClass(tone: NormalizedProviderDiagnostic['tone']): string {
  if (tone === 'danger') return 'border-status-dropped/50 bg-status-dropped/10 text-status-dropped';
  if (tone === 'warning') return 'border-status-on_hold/50 bg-status-on_hold/10 text-status-on_hold';
  if (tone === 'success') return 'border-status-completed/50 bg-status-completed/15 text-status-completed';
  return 'border-border bg-bg-elev text-muted';
}

function diagnosticGroupTitle(t: TDict, group: ProviderDiagnosticGroup): string {
  const map: Record<ProviderDiagnosticGroup, string> = {
    attention: 'groupAttention',
    blocked: 'groupBlocked',
    skipped: 'groupSkipped',
    no_results: 'groupNoResults',
    not_checked: 'groupNotChecked',
  };
  return providerDiagnosticText(t, map[group]);
}

function ProviderDiagnostics({ diagnostics, t }: { diagnostics: NormalizedProviderDiagnostic[]; t: TDict }) {
  const groups: ProviderDiagnosticGroup[] = ['attention', 'blocked', 'skipped', 'no_results', 'not_checked'];
  const technical = diagnostics.filter((diag) => diag.technicalDetail);
  return (
    <div className="mt-4 rounded-lg border border-border bg-bg-elev/25 p-3 text-[11px] text-muted">
      <h3 className="mb-2 font-bold uppercase tracking-widest text-muted">{t.stock.providerStatus}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => {
          const items = diagnostics.filter((diag) => diag.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="rounded-lg border border-border bg-bg/40 p-2">
              <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">{diagnosticGroupTitle(t, group)}</h4>
              <ul className="space-y-1.5">
                {items.map((diag) => (
                  <li key={diag.provider} className="flex items-start gap-2">
                    {diag.tone === 'danger' ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-dropped" aria-hidden />
                    ) : diag.group === 'blocked' ? (
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-on_hold" aria-hidden />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-white">{diag.label}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${diagnosticToneClass(diag.tone)}`}>
                          {providerDiagnosticText(t, diag.badgeKey)}
                        </span>
                        {diag.secondaryKey && (
                          <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                            {providerDiagnosticText(t, diag.secondaryKey)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-muted">{providerDiagnosticText(t, diag.messageKey)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {technical.length > 0 && (
        <details className="mt-3 rounded-md border border-border bg-bg/50 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted hover:text-accent">
            {providerDiagnosticText(t, 'technicalDetails')}
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[10px] text-muted">
            {technical.map((diag) => (
              <li key={`tech-${diag.provider}`}>{diag.label}: {diag.technicalDetail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AvailabilityChip({
  availability,
  label,
}: {
  availability: StockOffer['availability'];
  label: string;
}) {
  const cls =
    availability === 'in_stock'
      ? 'border-status-completed/50 bg-status-completed/15 text-status-completed'
      : availability === 'limited'
        ? 'border-status-on_hold/50 bg-status-on_hold/15 text-status-on_hold'
        : availability === 'out_of_stock'
          ? 'border-status-dropped/50 bg-status-dropped/10 text-status-dropped'
          : 'border-border bg-bg text-muted';
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

type TDict = ReturnType<typeof useT>;

function classifyGroup(offer: StockOffer): OfferGroup {
  return classifyOfferGroup(offer.content_kind, offer.series_relation, offer.match_confidence);
}

function ConfidenceChip({ mc, t }: { mc: string | null; t: TDict }) {
  if (!mc || mc === 'exact' || mc === 'high') return null;
  const labels = t.stock.matchConfidence as Record<string, string>;
  const label = labels[mc] ?? mc;
  const cls =
    mc === 'medium'
      ? 'border-status-on_hold/40 bg-status-on_hold/10 text-status-on_hold'
      : mc === 'low'
        ? 'border-status-dropped/40 bg-status-dropped/10 text-status-dropped'
        : 'border-border bg-bg text-muted';
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function notCountedReason(t: TDict, offer: StockOffer): string | null {
  if (isEligibleGameStockOffer(offer)) return null;
  const reasons = t.stock.notCountedReasons as Record<string, string>;
  if (offer.availability === 'out_of_stock') return reasons.outOfStock;
  if (offer.content_kind === 'soundtrack') return reasons.soundtrack;
  if (offer.content_kind === 'related_media') return reasons.relatedMusic;
  if (
    offer.content_kind === 'figure' ||
    offer.content_kind === 'related_goods' ||
    offer.content_kind === 'bonus_only' ||
    offer.content_kind === 'store_bonus_bundle' ||
    offer.series_relation === 'related_goods'
  ) return reasons.relatedGoods;
  if (offer.series_relation === 'unrelated') return reasons.unrelatedTitle;
  if (offer.match_confidence === 'low' || offer.match_confidence === 'reject') return reasons.weakMatch;
  if (offer.source === 'search') return reasons.searchOnly;
  return reasons.notEligible;
}

function OfferCard({
  offer,
  best,
  currency,
  t,
  locale,
}: {
  offer: StockOffer;
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: string;
}) {
  const isBest = offer.price != null && offer.price === best && best != null;
  const warnings: string[] = (() => {
    try { return offer.match_warnings_json ? (JSON.parse(offer.match_warnings_json) as string[]) : []; }
    catch { return []; }
  })();
  const mktPrice = offer.marketplace_price;
  const mktCount = offer.marketplace_count;
  const listPrice = offer.list_price;
  const notCounted = notCountedReason(t, offer);

  return (
    <li
      className={`rounded-lg border p-3 ${isBest ? 'border-accent/60 bg-accent/10' : 'border-border bg-bg-elev/40'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 max-w-full flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-md border border-border bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              {offer.provider_label}
            </span>
            <AvailabilityChip availability={offer.availability} label={availabilityLabel(t, offer, locale)} />
            <ConfidenceChip mc={offer.match_confidence} t={t} />
          </div>
          <h3 className="mt-2 line-clamp-2 break-words text-sm font-bold text-white">{offer.title}</h3>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-accent">
            {offer.price != null ? currency.format(offer.price) : t.stock.noPriceShort}
          </div>
          {listPrice != null && listPrice > 0 && (
            <div className="text-[10px] text-muted line-through">
              {(t.stock.offerListPrice as string).replace('{price}', currency.format(listPrice))}
            </div>
          )}
          {offer.currency && <div className="text-[10px] uppercase tracking-wide text-muted">{offer.currency}</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
        {offer.location_branch && (
          <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-semibold text-accent">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {offer.location_branch}
          </span>
        )}
        {offer.location_label && offer.location_label !== offer.location_branch && (
          <span className="rounded bg-bg px-1.5 py-0.5">
            {/* I-027: translate the sentinel at render time. */}
            {offer.location_label === ONLINE_STOCK_SENTINEL
              ? t.stock.onlineStockLabel
              : offer.location_label}
          </span>
        )}
        {offer.condition && (
          <span className="rounded bg-bg px-1.5 py-0.5">{stockConditionLabel(t, offer.condition)}</span>
        )}
        {offer.edition_label && (
          <span className="rounded bg-bg px-1.5 py-0.5">{stockEditionLabel(t, offer.edition_label)}</span>
        )}
        {offer.jan && <span className="rounded bg-bg px-1.5 py-0.5">{t.stock.jan.replace('{jan}', offer.jan)}</span>}
        {mktPrice != null && mktPrice > 0 && (
          <span className="rounded-md border border-border bg-bg px-1.5 py-0.5">
            {(t.stock.offerMarketplace as string).replace('{price}', mktPrice.toLocaleString(locale))}
            {mktCount != null && mktCount > 0 && (
              <> {(t.stock.offerMarketplaceCount as string).replace('{count}', String(mktCount))}</>
            )}
          </span>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {warnings.map((w) => (
            <span key={w} className="rounded bg-status-dropped/10 px-1.5 py-0.5 text-[10px] text-status-dropped/70">
              {stockWarningLabel(t, w)}
            </span>
          ))}
        </div>
      )}
      {notCounted && (
        <div className="mt-1.5 rounded-md border border-status-on_hold/35 bg-status-on_hold/10 px-2 py-1 text-[11px] text-status-on_hold">
          <span className="font-semibold">{t.stock.notCounted}</span>
          {' '}
          {notCounted}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-muted">
          {t.stock.source.replace('{source}', stockSourceLabel(t, offer.source))}
          {' · '}
          {timeAgo(offer.fetched_at, t)}
          {Date.now() - offer.fetched_at > STALE_MS && (
            <span
              className="ml-1.5 inline-flex items-center rounded border border-status-on_hold/40 bg-status-on_hold/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-status-on_hold"
              title={t.stock.staleHint as string}
            >
              {t.stock.staleHint as string}
            </span>
          )}
        </span>
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${t.stock.openShop} — ${offer.provider_label}`}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t.stock.openShop}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </li>
  );
}

function OfferGroup({
  label,
  offers,
  best,
  currency,
  t,
  locale,
  defaultCollapsed = false,
}: {
  label: string;
  offers: StockOffer[];
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const panelId = useId();
  if (offers.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted" id={`${panelId}-label`}>{label}</h3>
        <span className="rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted" aria-label={`${offers.length}`}>{offers.length}</span>
        {defaultCollapsed && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-expanded={!collapsed}
            aria-controls={panelId}
          >
            {collapsed
              ? (t.stock.groupExpand as string).replace('{count}', String(offers.length))
              : (t.stock.groupCollapse as string)}
          </button>
        )}
      </div>
      {!collapsed && (
        <ul
          id={panelId}
          aria-labelledby={`${panelId}-label`}
          className="grid gap-3 lg:grid-cols-2"
        >
          {offers.map((offer) => (
            <OfferCard key={`${offer.provider}:${offer.provider_offer_id}`} offer={offer} best={best} currency={currency} t={t} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OffersGrouped({
  offers,
  best,
  currency,
  t,
  locale,
}: {
  offers: StockOffer[];
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: string;
}) {
  // Single pass instead of 5 separate .filter() calls. classifyGroup is pure;
  // result depends only on the offer's classification fields. Memoised across
  // re-renders that share the same `offers` reference.
  const grouped = useMemo(() => {
    const game: StockOffer[] = [];
    const needsReview: StockOffer[] = [];
    const series: StockOffer[] = [];
    const related: StockOffer[] = [];
    const rejected: StockOffer[] = [];
    for (const offer of offers) {
      const group = classifyGroup(offer);
      if (group === 'game') game.push(offer);
      else if (group === 'needs_review') needsReview.push(offer);
      else if (group === 'series') series.push(offer);
      else if (group === 'related') related.push(offer);
      else rejected.push(offer);
    }
    return { game, needsReview, series, related, rejected };
  }, [offers]);
  const { game, needsReview, series, related, rejected } = grouped;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">
          {t.stock.offersTitle.replace('{count}', String(offers.length))}
        </h3>
        {best != null && (
          <span className="text-xs font-semibold text-accent">
            {t.stock.bestGamePrice.replace('{price}', currency.format(best))}
          </span>
        )}
      </div>
      <OfferGroup label={t.stock.groupGame as string} offers={game} best={best} currency={currency} t={t} locale={locale} />
      <OfferGroup label={t.stock.groupNeedsReview as string} offers={needsReview} best={best} currency={currency} t={t} locale={locale} defaultCollapsed />
      <OfferGroup label={t.stock.groupSameSeries as string} offers={series} best={best} currency={currency} t={t} locale={locale} defaultCollapsed />
      <OfferGroup label={t.stock.groupRelated as string} offers={related} best={best} currency={currency} t={t} locale={locale} defaultCollapsed />
      <OfferGroup label={t.stock.groupRejected as string} offers={rejected} best={best} currency={currency} t={t} locale={locale} defaultCollapsed />
    </div>
  );
}
