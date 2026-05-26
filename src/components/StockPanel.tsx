'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
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
  X,
} from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';
import { SkeletonRows } from './Skeleton';

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
}

interface StockStatus {
  provider: string;
  status: 'ok' | 'skipped' | 'error';
  message: string | null;
  fetched_at: number;
  offer_count: number;
}

interface StockProvider {
  id: string;
  label: string;
  kind: 'direct' | 'aggregate' | 'cached';
  physical: boolean;
  cloudflare: boolean;
}

interface StockSnapshot {
  offers: StockOffer[];
  statuses: StockStatus[];
  providers: StockProvider[];
  summary: {
    total: number;
    available: number;
    best_price: number | null;
    last_refresh: number | null;
  };
}

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
    fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { aliases: [] }))
      .then((data: { aliases: string[] }) => setAliases(data.aliases ?? []))
      .catch(() => {});
  }, [vnId]);

  const providers = snapshot?.providers ?? [];

  useEffect(() => {
    if (physicalDefaultRef.current || providers.length === 0) return;
    physicalDefaultRef.current = true;
    const physicalIds = providers.filter((p) => p.physical && p.kind !== 'cached').map((p) => p.id);
    if (physicalIds.length > 0) setSelectedProviders(physicalIds);
  }, [providers.length]);

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
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, action: 'add' }),
      });
      if (r.ok) {
        const data = (await r.json()) as { aliases: string[] };
        setAliases(data.aliases ?? []);
        setAliasInput('');
      }
    } catch {
    } finally {
      setAliasLoading(false);
    }
  }

  async function removeAlias(term: string) {
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
      }
    } catch {
    } finally {
      setAliasLoading(false);
    }
  }

  const offers = snapshot?.offers ?? [];
  const refreshableProviders = providers.filter((p) => p.kind !== 'cached');
  const selectedProviderIds = selectedProviders ?? refreshableProviders.map((p) => p.id);
  const selectedProviderSet = useMemo(() => new Set(selectedProviderIds), [selectedProviderIds]);
  const statusByProvider = useMemo(
    () => new Map((snapshot?.statuses ?? []).map((s) => [s.provider, s])),
    [snapshot?.statuses],
  );
  const offerCountByProvider = useMemo(() => {
    const out = new Map<string, number>();
    for (const offer of offers) out.set(offer.provider, (out.get(offer.provider) ?? 0) + 1);
    return out;
  }, [offers]);

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
  const failed = (snapshot?.statuses ?? []).filter((s) => s.status === 'error');
  const skipped = (snapshot?.statuses ?? []).filter((s) => s.status === 'skipped');
  const checkedStatuses = snapshot?.statuses ?? [];

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  function setProviderGroup(kind: 'all' | 'physical' | 'aggregate') {
    if (kind === 'all') {
      setSelectedProviders(null);
      return;
    }
    if (kind === 'physical') {
      const ids = providers.filter((p) => p.physical && p.kind !== 'cached').map((p) => p.id);
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
    <section className={`rounded-xl border border-border bg-bg-card ${dense ? 'p-4' : 'p-4 sm:p-5'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <ShoppingBag className="h-4 w-4 text-accent" aria-hidden />
            {t.stock.title}
          </h2>
          {title && <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1">
              <PackageSearch className="h-3 w-3" aria-hidden />
              {t.stock.availableCount
                .replace('{available}', String(snapshot?.summary.available ?? 0))
                .replace('{total}', String(snapshot?.summary.total ?? 0))}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1">
              <CircleDollarSign className="h-3 w-3" aria-hidden />
              {best != null ? t.stock.bestPrice.replace('{price}', currency.format(best)) : t.stock.noPrice}
            </span>
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
            onClick={refresh}
            disabled={refreshing || (selectedProviders != null && selectedProviders.length === 0)}
            className="btn btn-primary min-h-[44px]"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {checkButtonLabel}
          </button>
        </div>
      </header>

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
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => {
              const status = statusByProvider.get(provider.id);
              const count = offerCountByProvider.get(provider.id) ?? status?.offer_count ?? 0;
              const selectable = provider.kind !== 'cached';
              const selected = selectable ? selectedProviderSet.has(provider.id) : false;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => selectable && toggleProvider(provider.id)}
                  disabled={refreshing || !selectable}
                  aria-pressed={selected}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10 text-white'
                      : selectable
                        ? 'border-border bg-bg text-muted hover:border-accent hover:text-accent'
                        : 'border-border bg-bg/60 text-muted opacity-80'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">{provider.label}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
                        {provider.kind === 'cached'
                          ? t.stock.providerCached
                          : provider.kind === 'aggregate'
                            ? t.stock.providersAggregate
                            : provider.physical
                              ? t.stock.groupPhysical
                              : t.stock.providersDirect}
                      </span>
                    </span>
                    <ProviderStatusBadge
                      t={t}
                      status={status}
                      count={count}
                      cached={provider.kind === 'cached'}
                      cloudflare={provider.cloudflare}
                      loading={refreshing && currentProvider === provider.id}
                    />
                  </span>
                </button>
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
                {alias}
                <button
                  type="button"
                  onClick={() => removeAlias(alias)}
                  disabled={aliasLoading}
                  aria-label={t.stock.aliasRemoveTerm}
                  className="rounded p-0.5 text-muted hover:text-status-dropped disabled:opacity-50"
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
            onChange={(e) => setAliasInput(e.target.value)}
            placeholder={t.stock.aliasPlaceholder}
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
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-3 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-4">
          <SkeletonRows count={3} withThumb={false} />
        </div>
      )}

      {!loading && offers.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-bg-elev/30 p-4 text-sm text-muted">
          {checkedStatuses.length > 0 ? t.stock.emptyAfterCheck : t.stock.empty}
        </div>
      )}

      {!loading && offers.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {t.stock.offersTitle.replace('{count}', String(offers.length))}
            </h3>
            {best != null && <span className="text-xs font-semibold text-accent">{currency.format(best)}</span>}
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {offers.map((offer, index) => (
              <li
                key={`${offer.provider}:${offer.provider_offer_id}`}
                className={`rounded-lg border p-3 ${
                  index === 0 && offer.price === best && best != null
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-border bg-bg-elev/40'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border border-border bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                        {offer.provider_label}
                      </span>
                      <AvailabilityChip availability={offer.availability} label={availabilityLabel(t, offer)} />
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-bold text-white">{offer.title}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-accent">
                      {offer.price != null ? currency.format(offer.price) : t.stock.noPriceShort}
                    </div>
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
                    <span className="rounded bg-bg px-1.5 py-0.5">{offer.location_label}</span>
                  )}
                  {offer.condition && <span className="rounded bg-bg px-1.5 py-0.5">{offer.condition}</span>}
                  {offer.edition_label && <span className="rounded bg-bg px-1.5 py-0.5">{offer.edition_label}</span>}
                  {offer.jan && <span className="rounded bg-bg px-1.5 py-0.5">{t.stock.jan.replace('{jan}', offer.jan)}</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] text-muted">
                    {t.stock.source.replace('{source}', stockSourceLabel(t, offer.source))}
                  </span>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-accent"
                  >
                    {t.stock.openShop}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && (failed.length > 0 || skipped.length > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-bg-elev/25 p-3 text-[11px] text-muted">
          <h3 className="mb-2 font-bold uppercase tracking-widest text-muted">{t.stock.providerStatus}</h3>
          <div className="flex flex-wrap gap-2">
            {failed.map((s) => {
              const isProtected = providerById.get(s.provider)?.cloudflare === true;
              return isProtected ? (
                <span
                  key={`failed-${s.provider}`}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-400"
                >
                  <Lock className="h-3 w-3" aria-hidden />
                  {providerDisplayName(providers, s.provider)}: {t.stock.providerStatusProtected}
                </span>
              ) : (
                <span
                  key={`failed-${s.provider}`}
                  className="inline-flex items-center gap-1 rounded-md border border-status-dropped/40 bg-status-dropped/10 px-2 py-1 text-status-dropped"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {providerDisplayName(providers, s.provider)}: {s.message ?? t.common.error}
                </span>
              );
            })}
            {skipped.map((s) => (
              <span
                key={`skipped-${s.provider}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {providerDisplayName(providers, s.provider)}: {t.stock.skipped}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
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
      className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs font-semibold ${
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

function availabilityLabel(t: ReturnType<typeof useT>, offer: StockOffer): string {
  if (offer.availability_label) return offer.availability_label;
  return t.stock.availability[offer.availability];
}

function stockSourceLabel(t: ReturnType<typeof useT>, source: string): string {
  if (source === 'direct') return t.stock.sourceLabels.direct;
  if (source === 'search') return t.stock.sourceLabels.search;
  if (source === 'alicesoft_kobe') return t.stock.sourceLabels.cached;
  return source;
}

function providerDisplayName(providers: StockProvider[], providerId: string): string {
  return providers.find((p) => p.id === providerId)?.label ?? providerId;
}

function ProviderStatusBadge({
  t,
  status,
  count,
  cached,
  cloudflare = false,
  loading = false,
}: {
  t: ReturnType<typeof useT>;
  status: StockStatus | undefined;
  count: number;
  cached: boolean;
  cloudflare?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden />;
  }
  if (cached) {
    return <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">{count}</span>;
  }
  if (!status) {
    if (cloudflare) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
          <Lock className="h-3 w-3" aria-hidden />
          {t.stock.providerStatusProtected}
        </span>
      );
    }
    return (
      <span className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">
        {t.stock.providerNotChecked}
      </span>
    );
  }
  if (status.status === 'error' && cloudflare) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
        <Lock className="h-3 w-3" aria-hidden />
        {t.stock.providerStatusProtected}
      </span>
    );
  }
  const cls =
    status.status === 'error'
      ? 'border-status-dropped/50 bg-status-dropped/10 text-status-dropped'
      : status.status === 'skipped'
        ? 'border-border bg-bg-elev text-muted'
        : count > 0
          ? 'border-status-completed/50 bg-status-completed/15 text-status-completed'
          : 'border-border bg-bg-elev text-muted';
  const label =
    status.status === 'error'
      ? t.stock.providerStatusError
      : status.status === 'skipped'
        ? t.stock.providerStatusSkipped
        : t.stock.providerOfferCount.replace('{count}', String(count));
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
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
