'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { decodeStoredExtras, type ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
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
import type { Locale } from '@/lib/i18n/dictionaries';
import { currencyFormatter, fmtDate } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';
import { safeHref } from '@/lib/safe-href';
import { timeAgo } from '@/lib/time-ago';
import { normalizeProviderDiagnostic, type NormalizedProviderDiagnostic, type ProviderDiagnosticGroup } from '@/lib/stock-diagnostics';
import { classifyOfferGroup, isEligibleGameStockOffer, type OfferGroup } from '@/lib/stock-classify';
import { ONLINE_STOCK_SENTINEL } from '@/lib/stock-provider-constants';
import type {
  StockOfferDto as StockOffer,
  StockProviderDto as StockProvider,
  StockSnapshotDto as StockSnapshot,
  StockStatusDto as StockStatus,
} from '@/lib/stock-api-types';
import { StockPhysicalLocations, type PhysicalOffer } from './StockPhysicalLocations';
const ErogePricePanel = dynamic(() => import('./ErogePricePanel').then((m) => m.ErogePricePanel), { ssr: false });
const ClearCacheModal = dynamic(() => import('./stock/ClearCacheModal').then((m) => m.ClearCacheModal), {
  ssr: false,
  loading: () => <SkeletonRows count={2} withThumb={false} />,
});
import { SkeletonRows } from './Skeleton';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { ErrorAlert } from './ErrorAlert';
import {
  parseClientBooleanMap,
  parseClientPreferenceRecord,
  parseClientStringList,
} from '@/lib/client-persisted-shape';
import {
  decodeClearedStockSnapshot,
  decodeStockAliasesResult,
  decodeStockSnapshot,
} from '@/lib/stock-api-shape';

const STOCK_UI_KEY = 'stock:ui:v1';

interface StockUiPreferences {
  providerSetupOpen?: boolean;
  searchSetupOpen?: boolean;
  providerDiagOpen?: boolean;
}

function readStockUiPreferences(): StockUiPreferences {
  try {
    const raw = localStorage.getItem(STOCK_UI_KEY);
    if (!raw) return {};
    const record = parseClientPreferenceRecord(raw);
    return {
      providerSetupOpen: typeof record.providerSetupOpen === 'boolean' ? record.providerSetupOpen : undefined,
      searchSetupOpen: typeof record.searchSetupOpen === 'boolean' ? record.searchSetupOpen : undefined,
      providerDiagOpen: typeof record.providerDiagOpen === 'boolean' ? record.providerDiagOpen : undefined,
    };
  } catch {
    return {};
  }
}

function useStockUiPreference(key: keyof StockUiPreferences, defaultValue = false): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(readStockUiPreferences()[key] ?? defaultValue);
    setReady(true);
  }, [defaultValue, key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STOCK_UI_KEY, JSON.stringify({ ...readStockUiPreferences(), [key]: value }));
    } catch {}
  }, [key, ready, value]);

  return [value, setValue];
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const STOCK_OFFERS_KEY = 'stock:ui:offers:v1';
const STOCK_OFFER_PAGE_SIZE = 12;

const EMPTY_OFFERS: StockOffer[] = [];
const EMPTY_PROVIDERS: StockProvider[] = [];

export function StockPanel({
  vnId,
  title,
  altTitle,
  vndbAliases,
  dense = false,
  initialSnapshot,
  showErogePrice = true,
  placeMap = {},
  bare = false,
}: {
  vnId: string;
  title?: string;
  altTitle?: string | null;
  vndbAliases?: string[];
  dense?: boolean;
  initialSnapshot?: StockSnapshot;
  showErogePrice?: boolean;
  placeMap?: Record<string, number>;
  /**
   * Drop the outer card chrome (border / background / rounding) so the
   * panel sits flush inside a host that already provides a card - e.g.
   * the VN-detail `DetailSectionFrame`. Internal padding is kept.
   */
  bare?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasPendingTerm, setAliasPendingTerm] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const aliasSuggestions = useMemo(() => {
    const normalised = (s: string) => s.trim().toLowerCase();
    const existing = new Set(aliases.map(normalised));
    const candidates = [
      altTitle ?? null,
      ...(vndbAliases ?? []),
    ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of candidates) {
      const key = normalised(c);
      if (!existing.has(key) && !seen.has(key)) {
        seen.add(key);
        out.push(c.trim());
      }
    }
    return out;
  }, [aliases, altTitle, vndbAliases]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourcePendingId, setSourcePendingId] = useState<number | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [hideStale, setHideStale] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [providerSetupOpen, setProviderSetupOpen] = useStockUiPreference('providerSetupOpen');
  const [searchSetupOpen, setSearchSetupOpen] = useStockUiPreference('searchSetupOpen');
  const abortRef = useRef<AbortController | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const aliasAbortRef = useRef<AbortController | null>(null);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const clearCacheAbortRef = useRef<AbortController | null>(null);
  const identityRef = useRef(vnId);
  const mountedRef = useRef(true);
  const aliasMutationInFlightRef = useRef(false);
  const snapshotMutationInFlightRef = useRef(false);
  const physicalDefaultRef = useRef(false);

  const currency = useMemo(
    () => currencyFormatter(locale),
    [locale],
  );

  function ownsPanel(ownerVnId: string): boolean {
    return mountedRef.current && identityRef.current === ownerVnId;
  }

  function beginAliasMutation(): AbortController | null {
    if (aliasMutationInFlightRef.current) return null;
    aliasMutationInFlightRef.current = true;
    const controller = new AbortController();
    aliasAbortRef.current = controller;
    return controller;
  }

  function ownsAliasMutation(ownerVnId: string, controller: AbortController): boolean {
    return ownsPanel(ownerVnId) && aliasAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishAliasMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || aliasAbortRef.current !== controller) return;
    aliasAbortRef.current = null;
    aliasMutationInFlightRef.current = false;
    if (mountedRef.current) {
      setAliasLoading(false);
      setAliasPendingTerm(null);
    }
  }

  function beginSnapshotMutation(channelRef: MutableRefObject<AbortController | null>): AbortController | null {
    if (snapshotMutationInFlightRef.current) return null;
    snapshotMutationInFlightRef.current = true;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    const controller = new AbortController();
    channelRef.current = controller;
    return controller;
  }

  function ownsSnapshotMutation(
    ownerVnId: string,
    channelRef: MutableRefObject<AbortController | null>,
    controller: AbortController,
  ): boolean {
    return ownsPanel(ownerVnId) && channelRef.current === controller && !controller.signal.aborted;
  }

  function finishSnapshotMutation(
    ownerVnId: string,
    channelRef: MutableRefObject<AbortController | null>,
    controller: AbortController,
  ) {
    if (identityRef.current !== ownerVnId || channelRef.current !== controller) return;
    channelRef.current = null;
    snapshotMutationInFlightRef.current = false;
  }

  const load = useCallback(
    async (): Promise<boolean> => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = decodeStockSnapshot(await r.json());
        if (!data) throw new Error(t.common.error);
        if (controller.signal.aborted || loadAbortRef.current !== controller) return false;
        setSnapshot(data);
        return true;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || controller.signal.aborted || loadAbortRef.current !== controller) {
          return false;
        }
        setError(e instanceof Error && e.message ? e.message : t.common.error);
        return false;
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          setLoading(false);
        }
      }
    },
    [vnId, t.common.error],
  );

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = vnId;
    abortRef.current?.abort();
    abortRef.current = null;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    aliasAbortRef.current?.abort();
    aliasAbortRef.current = null;
    sourceAbortRef.current?.abort();
    sourceAbortRef.current = null;
    clearCacheAbortRef.current?.abort();
    clearCacheAbortRef.current = null;
    aliasMutationInFlightRef.current = false;
    snapshotMutationInFlightRef.current = false;
    physicalDefaultRef.current = false;
    setSnapshot(initialSnapshot ?? null);
    setLoading(!initialSnapshot);
    setRefreshing(false);
    setError(null);
    setSelectedProviders(null);
    setProgress(null);
    setCurrentProvider(null);
    setAliases([]);
    setAliasLoading(false);
    setAliasPendingTerm(null);
    setAliasError(null);
    setSourceLoading(false);
    setSourcePendingId(null);
    setSourceError(null);
    setClearingCache(false);
    setClearConfirmOpen(false);
  }, [vnId, initialSnapshot]);

  useEffect(() => {
    if (initialSnapshot) return;
    void load();
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [load, initialSnapshot]);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    aliasAbortRef.current?.abort();
    aliasAbortRef.current = null;
    sourceAbortRef.current?.abort();
    sourceAbortRef.current = null;
    clearCacheAbortRef.current?.abort();
    clearCacheAbortRef.current = null;
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { aliases: [] }))
      .then((data) => { if (!ctrl.signal.aborted) setAliases(decodeStockAliasesResult(data)?.aliases ?? []); })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[StockPanel] alias fetch failed:', e);
      });
    return () => ctrl.abort();
  }, [vnId]);

  const providers = snapshot?.providers ?? EMPTY_PROVIDERS;

  useEffect(() => {
    if (initialSnapshot || physicalDefaultRef.current || providers.length === 0) return;
    physicalDefaultRef.current = true;
    const physicalIds = providers.filter((p) => p.physical && !p.disabled).map((p) => p.id);
    if (physicalIds.length > 0) setSelectedProviders(physicalIds);
  }, [initialSnapshot, providers.length]);

  async function refresh() {
    const ctrl = beginSnapshotMutation(abortRef);
    if (!ctrl) return;
    const ownerVnId = vnId;
    setRefreshing(true);
    setError(null);

    const toCheck = (selectedProviders ?? refreshableProviderIds).filter((id) => refreshableProviderSet.has(id));
    setProgress({ done: 0, total: toCheck.length });
    setCurrentProvider(null);

    for (let i = 0; i < toCheck.length; i++) {
      if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) break;
      const provider = toCheck[i];
      setCurrentProvider(provider);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providers: [provider] }),
          signal: ctrl.signal,
        });
        if (r.ok) {
          const data = decodeStockSnapshot(await r.json());
          if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) break;
          if (data) setSnapshot(data);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
      }
      if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) break;
      setProgress({ done: i + 1, total: toCheck.length });
    }

    if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) return;
    setCurrentProvider(null);
    finishSnapshotMutation(ownerVnId, abortRef, ctrl);
    setRefreshing(false);
    setLoading(false);
    router.refresh();
  }

  /**
   * Single-provider refresh - surfaced as a per-tile button so the
   * operator can re-check just one shop without re-running the entire
   * lineup. Same wire shape as the bulk refresh, just constrained to
   * one provider.
   */
  const refreshOnlyProvider = useCallback(
    async (provider: string) => {
      const ctrl = beginSnapshotMutation(abortRef);
      if (!ctrl) return;
      const ownerVnId = vnId;
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
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (r.ok) {
          const snapshot = decodeStockSnapshot(await r.json());
          if (!snapshot) throw new Error(t.common.error);
          if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) return;
          setSnapshot(snapshot);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) {
          setError(e instanceof Error && e.message ? e.message : t.common.error);
        }
      }
      if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) return;
      setProgress({ done: 1, total: 1 });
      setCurrentProvider(null);
      finishSnapshotMutation(ownerVnId, abortRef, ctrl);
      setRefreshing(false);
      setLoading(false);
      router.refresh();
    },
    [vnId, t.common.error, router],
  );

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    snapshotMutationInFlightRef.current = false;
    setRefreshing(false);
    setCurrentProvider(null);
    setLoading(false);
  }

  const handleAddAlias = useCallback(
    async (term: string): Promise<boolean> => {
      const controller = beginAliasMutation();
      if (!controller) return false;
      const ownerVnId = vnId;
      setAliasLoading(true);
      setAliasPendingTerm(term);
      setAliasError(null);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term, action: 'add' }),
          signal: controller.signal,
        });
        const data = decodeStockAliasesResult(await r.json());
        if (!ownsAliasMutation(ownerVnId, controller)) return false;
        if (r.ok) {
          if (!data?.aliases) throw new Error(t.common.error);
          setAliases(data.aliases);
          toast.success(t.stock.aliasAddedToast);
          return true;
        }
        if (data?.aliases) setAliases(data.aliases);
        setAliasError(data?.error ?? t.common.error);
        toast.error(data?.error ?? t.common.error);
        return false;
      } catch (e) {
        if (!ownsAliasMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return false;
        const message = e instanceof Error && e.message ? e.message : t.common.error;
        setAliasError(message);
        toast.error(message);
        return false;
      } finally {
        finishAliasMutation(ownerVnId, controller);
      }
    },
    [vnId, t.common.error, t.stock.aliasAddedToast, toast],
  );

  async function removeAlias(term: string) {
    const ownerVnId = vnId;
    const controller = beginAliasMutation();
    if (!controller) return;
    const ok = await confirm({
      message: t.stock.aliasRemoveConfirm.replace('{term}', term),
      tone: 'danger',
    });
    if (!ok || !ownsAliasMutation(ownerVnId, controller)) {
      finishAliasMutation(ownerVnId, controller);
      return;
    }
    setAliasLoading(true);
    setAliasPendingTerm(term);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, action: 'delete' }),
        signal: controller.signal,
      });
      if (!ownsAliasMutation(ownerVnId, controller)) return;
      if (r.ok) {
        const data = decodeStockAliasesResult(await r.json());
        if (!data?.aliases) throw new Error(t.common.error);
        setAliases(data.aliases);
        toast.success(t.stock.aliasRemovedToast);
      } else {
        const message = await readApiError(r, t.common.error);
        setAliasError(message);
        toast.error(message);
      }
    } catch (e) {
      if (!ownsAliasMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      const message = e instanceof Error && e.message ? e.message : t.common.error;
      setAliasError(message);
      toast.error(message);
    } finally {
      finishAliasMutation(ownerVnId, controller);
    }
  }

  const handleAddSource = useCallback(
    async (url: string): Promise<boolean> => {
      const controller = beginSnapshotMutation(sourceAbortRef);
      if (!controller) return false;
      const ownerVnId = vnId;
      setSourceLoading(true);
      setSourceError(null);
      try {
        const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.stock.manualSourceUnsupported));
        const snapshot = decodeStockSnapshot(await r.json());
        if (!snapshot) throw new Error(t.common.error);
        if (!ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller)) return false;
        setSnapshot(snapshot);
        toast.success(t.stock.manualSourceAddedToast);
        return true;
      } catch (e) {
        if (!ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller) || (e instanceof Error && e.name === 'AbortError')) return false;
        const message = e instanceof Error && e.message ? e.message : t.common.error;
        setSourceError(message);
        toast.error(message);
        return false;
      } finally {
        finishSnapshotMutation(ownerVnId, sourceAbortRef, controller);
        if (ownsPanel(ownerVnId)) setSourceLoading(false);
      }
    },
    [vnId, t.common.error, t.stock.manualSourceUnsupported, t.stock.manualSourceAddedToast, toast],
  );

  async function removeSource(id: number) {
    const ownerVnId = vnId;
    const controller = beginSnapshotMutation(sourceAbortRef);
    if (!controller) return;
    const ok = await confirm({
      message: t.stock.manualSourceDeleteConfirm,
      tone: 'danger',
    });
    if (!ok || !ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller)) {
      finishSnapshotMutation(ownerVnId, sourceAbortRef, controller);
      return;
    }
    setSourceLoading(true);
    setSourcePendingId(id);
    setSourceError(null);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/sources`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const snapshot = decodeStockSnapshot(await r.json());
      if (!snapshot) throw new Error(t.common.error);
      if (!ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller)) return;
      setSnapshot(snapshot);
      toast.success(t.stock.manualSourceDeletedToast);
    } catch (e) {
      if (!ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      const message = e instanceof Error && e.message ? e.message : t.common.error;
      setSourceError(message);
      toast.error(message);
    } finally {
      finishSnapshotMutation(ownerVnId, sourceAbortRef, controller);
      if (ownsPanel(ownerVnId)) {
        setSourceLoading(false);
        setSourcePendingId(null);
      }
    }
  }

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  function clearCache() {
    setClearConfirmOpen(true);
  }

  async function performClearCache() {
    const controller = beginSnapshotMutation(clearCacheAbortRef);
    if (!controller) return;
    const ownerVnId = vnId;
    setClearConfirmOpen(false);
    setClearingCache(true);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!ownsSnapshotMutation(ownerVnId, clearCacheAbortRef, controller)) return;
      if (r.ok) {
        const snapshot = decodeClearedStockSnapshot(await r.json());
        if (snapshot) {
          setSnapshot(snapshot);
        } else {
          setSnapshot(null);
          await load();
          if (!ownsSnapshotMutation(ownerVnId, clearCacheAbortRef, controller)) return;
        }
        toast.success(t.stock.cacheClearedToast);
      } else {
        const message = await readApiError(r, t.common.error);
        setError(message);
        toast.error(message);
      }
    } catch (e) {
      if (!ownsSnapshotMutation(ownerVnId, clearCacheAbortRef, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      const message = e instanceof Error && e.message ? e.message : t.common.error;
      setError(message);
      toast.error(message);
    } finally {
      finishSnapshotMutation(ownerVnId, clearCacheAbortRef, controller);
      if (ownsPanel(ownerVnId)) setClearingCache(false);
    }
  }

  const now = useMemo(() => Date.now(), [snapshot]);
  const allOffers = snapshot?.offers ?? EMPTY_OFFERS;
  const staleProviderIds = useMemo(() => {
    if (!hideStale) return new Set<string>();
    return new Set(
      (snapshot?.statuses ?? [])
        .filter((s) => now - s.fetched_at > STALE_MS)
        .map((s) => s.provider),
    );
  }, [hideStale, snapshot?.statuses, now]);
  const offers = useMemo(
    () => (hideStale ? allOffers.filter((o) => !staleProviderIds.has(o.provider)) : allOffers),
    [hideStale, allOffers, staleProviderIds],
  );
  const refreshableProviders = useMemo(() => providers.filter((p) => p.kind !== 'cached' && !p.disabled), [providers]);
  const refreshableProviderIds = useMemo(() => refreshableProviders.map((p) => p.id), [refreshableProviders]);
  const refreshableProviderSet = useMemo(() => new Set(refreshableProviderIds), [refreshableProviderIds]);
  const selectableProviders = useMemo(() => providers.filter((p) => !p.disabled), [providers]);
  const selectableProviderIds = useMemo(() => selectableProviders.map((p) => p.id), [selectableProviders]);
  const selectedProviderIds = selectedProviders ?? selectableProviderIds;
  const selectedProviderSet = useMemo(() => new Set(selectedProviderIds), [selectedProviderIds]);
  const refreshSelectionCount = useMemo(
    () => selectedProviderIds.filter((id) => refreshableProviderSet.has(id)).length,
    [selectedProviderIds, refreshableProviderSet],
  );
  const statusByProvider = useMemo(
    () => new Map((snapshot?.statuses ?? []).map((s) => [s.provider, s])),
    [snapshot?.statuses],
  );
  const erogePriceExtras = useMemo<ErogePriceExtrasV1 | null>(() => {
    const row = statusByProvider.get('eroge_price');
    return decodeStoredExtras(row?.extras_json);
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
    () => new Set(providers.filter((p) => p.physical && !p.disabled).map((p) => p.id)),
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
      diag.kind !== 'partial' && // Suruga-ya "Search OK" is a success state - the tile badge already says so.
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
      const ids = providers.filter((p) => p.physical && !p.disabled).map((p) => p.id);
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

  const toggleProvider = useCallback(
    (id: string) => {
      setSelectedProviders((prev) => {
        const next = new Set(prev ?? selectableProviderIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size === 0) return prev;
        const values = selectableProviderIds.filter((pid) => next.has(pid));
        return values.length === selectableProviderIds.length ? null : values;
      });
    },
    [selectableProviderIds],
  );

  const checkButtonLabel = refreshing
    ? t.stock.checkingProviders.replace(
        '{count}',
        progress ? `${progress.done}/${progress.total}` : String(refreshSelectionCount || refreshableProviders.length),
      )
    : isPhysicalSelection
      ? t.stock.checkPhysical
      : t.stock.check;

  return (
    <section className={`${bare ? '' : 'overflow-hidden rounded-xl border border-border bg-bg-card'} ${dense ? 'p-4' : 'p-4 sm:p-5'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1">
          {!bare && (
            <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
              <ShoppingBag className="h-4 w-4 text-accent" aria-hidden />
              {t.stock.title}
            </h2>
          )}
          {title && <p className={`${bare ? '' : 'mt-1 '}break-words text-sm font-semibold text-white`}>{title}</p>}
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
                {t.stock.lastChecked.replace('{date}', timeAgo(lastRefresh, t))}
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
            disabled={refreshing || refreshSelectionCount === 0}
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
        <details
          open={providerSetupOpen}
          onToggle={(e) => setProviderSetupOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="mt-4 group rounded-lg border border-border bg-bg-elev/25"
        >
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] text-muted hover:text-white [&::-webkit-details-marker]:hidden">
            <PackageSearch className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 font-bold uppercase tracking-widest">{t.stock.providers}</span>
            <span className="text-[11px] text-muted">
              {t.stock.providerSelectedCount
                .replace('{selected}', String(selectedProviderIds.length))
                .replace('{total}', String(selectableProviders.length))}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="p-3 pt-0">
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
              const selectable = !provider.disabled;
              const refreshable = refreshableProviderSet.has(provider.id);
              const status = statusByProvider.get(provider.id);
              return (
                <ProviderTile
                  key={provider.id}
                  provider={provider}
                  status={status}
                  count={offerCountByProvider.get(provider.id) ?? status?.offer_count ?? 0}
                  diagnostic={diagnosticByProvider.get(provider.id)}
                  selectable={selectable}
                  refreshable={refreshable}
                  selected={selectable ? selectedProviderSet.has(provider.id) : false}
                  refreshing={refreshing}
                  isRefreshingThis={refreshing && currentProvider === provider.id}
                  locale={locale}
                  t={t}
                  onToggle={toggleProvider}
                  onRefreshOnly={refreshOnlyProvider}
                />
              );
            })}
          </div>
          </div>
        </details>
      )}

      <details
        open={searchSetupOpen}
        onToggle={(e) => setSearchSetupOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="mt-4 group rounded-lg border border-border bg-bg-elev/25"
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-muted hover:text-white [&::-webkit-details-marker]:hidden">
          <Tag className="h-3 w-3" aria-hidden />
          <span className="flex-1">{t.stock.searchSetup as string}</span>
          {(aliases.length > 0 || (snapshot?.sources ?? []).length > 0) && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              {aliases.length + (snapshot?.sources ?? []).length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="p-3 pt-0 space-y-4">
        <div>
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
                  {aliasPendingTerm === alias ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                </button>
              </span>
            ))}
          </div>
        )}
        {aliasSuggestions.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] text-muted">{t.stock.aliasSuggested as string}</p>
            <div className="flex flex-wrap gap-1">
              {aliasSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={aliasLoading}
                  onClick={() => { void handleAddAlias(s); }}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-dashed border-border bg-bg px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
                >
                  {aliasPendingTerm === s ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                  <span className="inline-block max-w-[12rem] truncate align-bottom">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <AliasAddForm
          t={t}
          loading={aliasLoading}
          error={aliasError}
          onSubmit={handleAddAlias}
          onClearError={() => setAliasError(null)}
        />
        </div>
        <div>
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
          <ExternalLink className="h-3 w-3" aria-hidden />
          {t.stock.manualSources}
        </h3>
        <p className="mt-1 text-[11px] text-muted">{t.stock.manualSourceHint}</p>
        {(snapshot?.sources ?? []).length > 0 && (
          <ul className="mt-2 space-y-1">
            {(snapshot?.sources ?? []).map((source) => {
              const sourceHref = safeHref(source.url);
              return (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-2 py-1.5 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded bg-bg-elev px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    {providerDisplayName(providers, source.provider)}
                  </span>
                  {sourceHref ? (
                    <a
                      href={sourceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-white hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      title={source.url}
                    >
                      {source.product_id ?? source.url}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-white" title={source.url}>
                      {source.product_id ?? source.url}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  disabled={sourceLoading}
                  aria-label={`${t.stock.manualSourceDelete}: ${providerDisplayName(providers, source.provider)}`}
                  className="tap-target inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-0.5 text-muted hover:text-status-dropped focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped disabled:opacity-50 sm:min-h-0 sm:min-w-0"
                >
                  {sourcePendingId === source.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                </button>
              </li>
              );
            })}
          </ul>
        )}
        <SourceAddForm
          t={t}
          providers={providers}
          loading={sourceLoading}
          error={sourceError}
          onSubmit={handleAddSource}
          onClearError={() => setSourceError(null)}
        />
        </div>
        </div>
      </details>

      {error && (
        <div className="mt-3">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
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
        <OffersGrouped offers={offers} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} />
      )}

      {!loading && confirmedPhysicalIds.size > 0 && (
        <StockPhysicalLocations offers={physicalOffers} placeMap={placeMap} />
      )}

      {/* R12-EROGEPRICE-UI: render the full Eroge Price bundle -
          multi-candidate tabs, identity card, all-time / 30-day stats,
          full price-history line chart, per-edition retailer rows,
          staff / voice actors, related games. The data is the
          extras_json blob stored on `vn_stock_provider_status` for the
          eroge_price provider. Lazy-loaded so the whole graph chunk
          doesn't ride along with every StockPanel mount. */}
      {showErogePrice !== false && !loading && erogePriceExtras && <ErogePricePanel vnId={vnId} extras={erogePriceExtras} />}

      {!loading && displayDiagnostics.length > 0 && (
        <ProviderDiagnostics diagnostics={displayDiagnostics} t={t} defaultOpen={displayDiagnostics.some((d) => d.group === 'attention' || d.group === 'blocked')} />
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

/**
 * Owns its own input state so keystrokes re-render only this form, not the
 * whole StockPanel. Submits the trimmed term to the parent and clears the
 * field once the parent confirms the add succeeded.
 */
function AliasAddForm({
  t,
  loading,
  error,
  onSubmit,
  onClearError,
}: {
  t: TDict;
  loading: boolean;
  error: string | null;
  onSubmit: (term: string) => Promise<boolean>;
  onClearError: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const term = value.trim();
          if (!term || loading) return;
          if (await onSubmit(term)) setValue('');
        }}
        className="mt-2 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) onClearError(); }}
          placeholder={t.stock.aliasPlaceholder}
          aria-label={t.stock.aliasPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'stock-alias-error' : undefined}
          maxLength={100}
          className="min-h-[44px] flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-white placeholder-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg sm:min-h-[36px]"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="btn btn-primary min-h-[44px] text-xs sm:min-h-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {t.stock.aliasAdd}
        </button>
      </form>
      {error && (
        <p id="stock-alias-error" role="alert" className="mt-2 text-xs text-status-dropped">{error}</p>
      )}
    </>
  );
}

/**
 * Owns its own input state and live-previews the detected provider from the
 * typed URL. Submits the trimmed URL to the parent and clears the field once
 * the parent confirms the add succeeded.
 */
function SourceAddForm({
  t,
  providers,
  loading,
  error,
  onSubmit,
  onClearError,
}: {
  t: TDict;
  providers: StockProvider[];
  loading: boolean;
  error: string | null;
  onSubmit: (url: string) => Promise<boolean>;
  onClearError: () => void;
}) {
  const [value, setValue] = useState('');
  const detectedProvider = useMemo(() => {
    const raw = value.trim();
    if (!raw || providers.length === 0) return null;
    let host = '';
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
    if (!host) return null;
    const match = providers.find((p) => providerHostMatches(p.id, host));
    return match?.label ?? null;
  }, [value, providers]);
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const url = value.trim();
          if (!url || loading) return;
          if (await onSubmit(url)) setValue('');
        }}
        className="mt-2 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) onClearError(); }}
          placeholder={t.stock.manualSourcePlaceholder}
          aria-label={t.stock.manualSourcePlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'stock-source-error' : undefined}
          maxLength={1024}
          className="min-h-[44px] flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-white placeholder-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg sm:min-h-[36px]"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="btn btn-primary min-h-[44px] text-xs sm:min-h-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {t.stock.manualSourceAdd}
        </button>
      </form>
      {detectedProvider && (
        <p className="mt-1 text-[10px] text-muted">
          {(t.stock.manualSourceDetected as string).replace('{provider}', detectedProvider)}
        </p>
      )}
      {error && (
        <p id="stock-source-error" role="alert" className="mt-2 text-xs text-status-dropped">{error}</p>
      )}
    </>
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

function availabilityLabel(t: ReturnType<typeof useT>, offer: StockOffer, currency: Intl.NumberFormat): string {
  if (offer.availability_label) return stockAvailabilityLabel(t, offer.availability_label, currency);
  return t.stock.availability[offer.availability];
}

function stockSourceLabel(t: ReturnType<typeof useT>, source: string): string {
  if (source === 'direct') return t.stock.sourceLabels.direct;
  if (source === 'search') return t.stock.sourceLabels.search;
  if (source === 'manual') return t.stock.sourceLabels.manual;
  if (source === 'alicenet') return t.stock.sourceLabels.cached;
  return source;
}

/**
 * I-007: translate the slug-keyed warnings emitted by stock-classify.
 * Legacy DB rows still carry the old English wording - map them back
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
  'Edition / bonus': 'edition_bonus',
};

const LEGACY_CONDITION_MAP: Record<string, string> = {
  'New': 'new',
  'Used': 'used',
  'Sealed': 'sealed',
  'Used (Rank B)': 'used_rank_b',
};

const LEGACY_AVAILABILITY_LABEL_MAP: Record<string, string> = {
  'Sold out': 'sold_out',
  'Several': 'several',
  'AliceNet stock': 'alicenet_stock',
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
  currency: Intl.NumberFormat,
): string {
  const marketplaceMatch = /^(?:marketplace:|Marketplace:\s*¥)(\d[\d,]*)$/.exec(raw);
  if (marketplaceMatch) {
    const price = Number(marketplaceMatch[1].replace(/,/g, ''));
    const dict = t.stock.availabilityLabels as Record<string, string | undefined>;
    const tpl = dict.marketplace;
    if (tpl) {
      return tpl.replace('{price}', currency.format(price));
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
 * Client-side mirror of PROVIDER_HOSTS in stock.ts - used to live-preview the
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

function providerCapabilityText(t: TDict, provider: StockProvider): string {
  const fallback =
    provider.kind === 'cached'
      ? t.stock.providerCached
      : provider.kind === 'aggregate'
        ? t.stock.providersAggregate
        : t.stock.providersDirect;
  const labels: string[] = [
    (provider.resultCapability ? t.stock.providerCapabilities?.[provider.resultCapability] : null) ?? fallback,
  ];
  if (provider.lookupCapabilities?.includes('jan_lookup') && t.stock.providerCapabilities?.janLookup) labels.push(t.stock.providerCapabilities.janLookup);
  if (provider.supportLevel === 'limited' && t.stock.providerCapabilities?.limited) labels.push(t.stock.providerCapabilities.limited);
  if (provider.supportLevel === 'manual_only' && t.stock.providerCapabilities?.manualOnly) labels.push(t.stock.providerCapabilities.manualOnly);
  return labels.join(' / ');
}

const ProviderTile = memo(function ProviderTile({
  provider,
  status,
  count,
  diagnostic,
  selectable,
  refreshable,
  selected,
  refreshing,
  isRefreshingThis,
  locale,
  t,
  onToggle,
  onRefreshOnly,
}: {
  provider: StockProvider;
  status: StockStatus | undefined;
  count: number;
  diagnostic: NormalizedProviderDiagnostic | undefined;
  selectable: boolean;
  refreshable: boolean;
  selected: boolean;
  refreshing: boolean;
  isRefreshingThis: boolean;
  locale: Locale;
  t: TDict;
  onToggle: (id: string) => void;
  onRefreshOnly: (id: string) => void;
}) {
  const badgeLabel = diagnostic ? providerDiagnosticText(t, diagnostic.badgeKey) : null;
  const capabilityLabel = providerCapabilityText(t, provider);
  const lastChecked = status?.fetched_at ? timeAgo(status.fetched_at, t) : null;
  const lastCheckedFull = status?.fetched_at ? fmtDate(new Date(status.fetched_at), locale) : null;
  const ariaLabel = `${provider.label}: ${capabilityLabel}. ${badgeLabel ?? (refreshable ? t.stock.providerNotChecked : t.stock.providerCached)}${count > 0 ? ` (${count})` : ''}`;
  const diagnosticMessage = diagnostic ? providerDiagnosticText(t, diagnostic.messageKey) : null;
  const tooltipParts: string[] = [];
  if (diagnosticMessage && diagnostic?.kind !== 'ok') tooltipParts.push(diagnosticMessage);
  if (lastCheckedFull) tooltipParts.push((t.stock.lastChecked as string).replace('{date}', lastCheckedFull));
  return (
    <div
      className={`group relative min-h-[44px] rounded-lg border py-2 pl-3 pr-14 text-left transition-colors sm:pr-11 ${
        provider.disabled
          ? 'border-border bg-bg/30 text-muted/40 opacity-60'
          : selected
            ? 'border-accent bg-accent/10 text-white'
            : selectable
              ? 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
              : 'border-border bg-bg/60 text-muted opacity-80'
      }`}
      title={provider.disabled ? (t.stock.providerDisabledHint as string) : (tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined)}
    >
      <button
        type="button"
        onClick={() => selectable && onToggle(provider.id)}
        disabled={refreshing || !selectable}
        aria-pressed={selected}
        aria-label={ariaLabel}
        className="block min-h-[44px] w-full min-w-0 text-left"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold">{provider.label}</span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
              {capabilityLabel}
            </span>
            {lastChecked && (
              <span className="mt-0.5 block text-[10px] text-muted/70">
                {(t.stock.lastCheckedShort as string).replace('{time}', lastChecked)}
              </span>
            )}
          </span>
          {provider.disabled ? (
            <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted/60">
              {t.stock.providerDisabled as string}
            </span>
          ) : (
            <ProviderStatusBadge
              t={t}
              diagnostic={diagnostic}
              count={count}
              cached={provider.kind === 'cached'}
              loading={isRefreshingThis}
            />
          )}
        </span>
      </button>
      {refreshable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefreshOnly(provider.id);
          }}
          disabled={refreshing}
          aria-busy={isRefreshingThis}
          aria-label={(t.stock.refreshOnlyProvider as string).replace('{provider}', provider.label)}
          title={(t.stock.refreshOnlyProvider as string).replace('{provider}', provider.label)}
          className="absolute right-1.5 top-1.5 inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-bg text-muted hover:border-accent hover:text-accent disabled:opacity-40 sm:h-7 sm:w-7"
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
});

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

function ProviderDiagnostics({ diagnostics, t, defaultOpen }: { diagnostics: NormalizedProviderDiagnostic[]; t: TDict; defaultOpen?: boolean }) {
  const groups: ProviderDiagnosticGroup[] = ['attention', 'blocked', 'skipped', 'no_results', 'not_checked'];
  const technical = diagnostics.filter((diag) => diag.technicalDetail);
  const attentionCount = diagnostics.filter((d) => d.group === 'attention' || d.group === 'blocked').length;
  const [isOpen, setIsOpen] = useStockUiPreference('providerDiagOpen', defaultOpen ?? false);
  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mt-4 group rounded-lg border border-border bg-bg-elev/25 text-[11px] text-muted"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden hover:text-white">
        <span className="flex-1 font-bold uppercase tracking-widest">{t.stock.providerStatus}</span>
        {attentionCount > 0 && (
          <span className="rounded-full border border-status-dropped/50 bg-status-dropped/10 px-1.5 py-0.5 text-[10px] font-bold text-status-dropped">
            {attentionCount}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="p-3 pt-0">
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
    </details>
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

const OfferCard = memo(function OfferCard({
  offer,
  best,
  currency,
  t,
  locale,
  placeMap,
}: {
  offer: StockOffer;
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: Locale;
  placeMap: Record<string, number>;
}) {
  const isBest = offer.price != null && offer.price === best && best != null;
  const warnings = parseClientStringList(offer.match_warnings_json);
  const mktPrice = offer.marketplace_price;
  const mktCount = offer.marketplace_count;
  const listPrice = offer.list_price;
  const notCounted = notCountedReason(t, offer);
  const offerHref = safeHref(offer.url);

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
            <AvailabilityChip availability={offer.availability} label={availabilityLabel(t, offer, currency)} />
            <ConfidenceChip mc={offer.match_confidence} t={t} />
            {isBest && (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent/60 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                <CircleDollarSign className="h-3 w-3 shrink-0" aria-hidden />
                {t.stock.bestPriceBadge as string}
              </span>
            )}
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
        {offer.location_branch && (() => {
          const placeId = placeMap[offer.location_branch];
          const inner = (
            <>
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {offer.location_branch}
            </>
          );
          return placeId != null ? (
            <Link
              href={`/places/${placeId}`}
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-semibold text-accent hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {inner}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-semibold text-accent">
              {inner}
            </span>
          );
        })()}
        {offer.location_label && offer.location_label !== offer.location_branch && (
          <span className="rounded bg-bg px-1.5 py-0.5">
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
            {(t.stock.offerMarketplace as string).replace('{price}', currency.format(mktPrice))}
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
          {' / '}
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
        {offerHref && (
          <a
            href={offerHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t.stock.openShop}: ${offer.provider_label}`}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:min-h-[36px]"
          >
            {t.stock.openShop}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
});

function OfferGroup({
  label,
  groupKey,
  offers,
  best,
  currency,
  t,
  locale,
  placeMap,
  defaultCollapsed = false,
}: {
  label: string;
  groupKey: string;
  offers: StockOffer[];
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: Locale;
  placeMap: Record<string, number>;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(STOCK_OFFERS_KEY);
      if (raw) {
        const stored = parseClientBooleanMap(raw)[groupKey];
        if (stored !== undefined) return stored;
      }
    } catch {}
    return defaultCollapsed;
  });
  useEffect(() => {
    try {
      const prev = parseClientBooleanMap(localStorage.getItem(STOCK_OFFERS_KEY));
      localStorage.setItem(STOCK_OFFERS_KEY, JSON.stringify({ ...prev, [groupKey]: collapsed }));
    } catch {}
  }, [collapsed, groupKey]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [offers]);
  const panelId = useId();
  const totalPages = Math.max(1, Math.ceil(offers.length / STOCK_OFFER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * STOCK_OFFER_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + STOCK_OFFER_PAGE_SIZE, offers.length);
  const visibleOffers = offers.slice(pageStart, pageEnd);
  if (offers.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted" id={`${panelId}-label`}>{label}</h3>
        <span
          className="rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted"
          aria-label={(t.stock.groupOfferCount as string)
            .replace('{group}', label)
            .replace('{count}', String(offers.length))}
        >
          {offers.length}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="min-h-[44px] rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:min-h-0"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          aria-label={(collapsed ? t.stock.groupExpandLabel : t.stock.groupCollapseLabel)
            .replace('{group}', label)
            .replace('{count}', String(offers.length))}
        >
          {collapsed
            ? (t.stock.groupExpand as string).replace('{count}', String(offers.length))
            : (t.stock.groupCollapse as string)}
        </button>
        {!collapsed && (
          <span className="ml-auto text-[10px] text-muted" role="status" aria-live="polite">
            {(t.stock.groupRange as string)
              .replace('{start}', String(pageStart + 1))
              .replace('{end}', String(pageEnd))
              .replace('{total}', String(offers.length))}
          </span>
        )}
      </div>
      {!collapsed && (
        <>
          <ul
            id={panelId}
            aria-labelledby={`${panelId}-label`}
            className="grid gap-3 lg:grid-cols-2"
          >
            {visibleOffers.map((offer) => (
              <OfferCard key={`${offer.provider}:${offer.provider_offer_id}`} offer={offer} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} />
            ))}
          </ul>
          {totalPages > 1 && (
            <nav
              className="mt-3 flex items-center justify-between gap-2"
              aria-label={(t.stock.groupPaginationLabel as string).replace('{group}', label)}
            >
              <button
                type="button"
                className="btn min-h-[44px] text-xs"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t.stock.previousPage as string}
              </button>
              <span className="text-[10px] text-muted">
                {(t.stock.groupPage as string)
                  .replace('{current}', String(currentPage))
                  .replace('{total}', String(totalPages))}
              </span>
              <button
                type="button"
                className="btn min-h-[44px] text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                {t.stock.nextPage as string}
              </button>
            </nav>
          )}
        </>
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
  placeMap,
}: {
  offers: StockOffer[];
  best: number | null;
  currency: Intl.NumberFormat;
  t: TDict;
  locale: Locale;
  placeMap: Record<string, number>;
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
      <OfferGroup label={t.stock.groupGame as string} groupKey="game" offers={game} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} />
      <OfferGroup label={t.stock.groupNeedsReview as string} groupKey="needs_review" offers={needsReview} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} defaultCollapsed />
      <OfferGroup label={t.stock.groupSameSeries as string} groupKey="series" offers={series} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} defaultCollapsed />
      <OfferGroup label={t.stock.groupRelated as string} groupKey="related" offers={related} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} defaultCollapsed />
      <OfferGroup label={t.stock.groupRejected as string} groupKey="rejected" offers={rejected} best={best} currency={currency} t={t} locale={locale} placeMap={placeMap} defaultCollapsed />
    </div>
  );
}
