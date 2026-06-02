'use client';

/**
 * Full integration of the eroge-price.com bundle into the Stock panel.
 *
 * Renders every field captured by `ErogePriceExtrasV1`:
 *  - multi-candidate tabs (operator demand: "one exact name match can
 *    have many games; integrate them all")
 *  - identity card (cover, title, brand, release date, age rating,
 *    platform, official-site links)
 *  - price-stats trio (all-time min, all-time max, 30-day min)
 *  - full price-history time-series as a multi-series line chart
 *    (`<PriceHistoryChart>` - one series per retailer x edition pair)
 *  - per-edition retailer tables with sale flag, condition, condition
 *    note, original price, discount rate
 *  - structured staff list (scenario / illustration / music / theme-
 *    song singer / voice actors)
 *  - related-games rail (connections with relationship kind label +
 *    sameBrand)
 *
 * The component is client-only because the candidate tab is local
 * state; the data itself is server-rendered into the initial
 * `extras` prop and never re-fetched.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, BadgePercent, Crown, Loader2, Pin, Plus, TrendingDown, TrendingUp, Mic2, Pencil, Music2, X } from 'lucide-react';
import { readApiError } from '@/lib/api-error-read';
import { decodeStoredExtras } from '@/lib/erogeprice-meta';
import type {
  EpApiPricePoint,
  EpApiRelatedConnection,
  EpApiRelatedItem,
  EpApiRetailer,
  EpApiStaff,
  ErogePriceBundle,
  ErogePriceExtrasV1,
} from '@/lib/erogeprice-meta';
import { useT, useLocale } from '@/lib/i18n/client';
import { formatCurrency } from '@/lib/locale-number';
import { safeHref } from '@/lib/safe-href';
import { decodeStockSnapshot } from '@/lib/stock-api-shape';
import { decodeStockTitleResolutionMap } from '@/lib/stock-title-resolution-client-shape';
import { useToast } from './ToastProvider';
import { SafeImage } from './SafeImage';
import { DEFAULT_PALETTE, PriceHistoryChart, type SparklineSeries } from './charts/Sparkline';

interface Props {
  /**
   * VNDB VN id (or `egs_<n>` synthetic) - needed so the "Set as
   * primary" button can PATCH the persisted extras_json envelope
   * via `/api/vn/<vnId>/stock/eroge-price`. Without it the manual
   * matching UI would only update local state and silently revert
   * on the next stock refresh.
   */
  vnId: string;
  extras: ErogePriceExtrasV1;
}

function fmtYen(yen: number | null | undefined, locale: 'fr' | 'en' | 'ja'): string {
  if (yen == null) return '-';
  return formatCurrency(yen, locale);
}

function fmtIsoDate(iso: string | null, locale: 'fr' | 'en' | 'ja'): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : locale === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Build one `SparklineSeries` per (retailer x edition) tuple from the
 * raw price-history array. Series sharing the same retailer but
 * different edition (DOWNLOAD vs PACKAGE) are kept separate because
 * the prices diverge wildly.
 */
function pointsToSeries(points: EpApiPricePoint[]): SparklineSeries[] {
  const groups = new Map<string, SparklineSeries>();
  for (const p of points) {
    const key = `${p.retailerName}|${p.retailerEdition}`;
    const existing = groups.get(key);
    const point = { x: new Date(p.scrapedAt).getTime(), y: p.price };
    if (existing) {
      existing.points.push(point);
    } else {
      const editionLabel = p.retailerEdition === 'PACKAGE' ? 'PKG' : 'DL';
      groups.set(key, {
        label: `${p.retailerName} (${editionLabel})`,
        points: [point],
      });
    }
  }
  return Array.from(groups.values());
}

function RetailerRow({ r, label }: { r: EpApiRetailer; label: string }) {
  const t = useT();
  const locale = useLocale();
  const sale = r.isOnSale && r.originalPrice && r.currentPrice && r.originalPrice > r.currentPrice;
  const productHref = safeHref(r.productUrl);
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-border/60 py-2 text-xs first:border-t-0">
      <span className="min-w-[6rem] font-semibold text-white">{r.retailerName}</span>
      <span className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5 text-[10px] text-muted">{label}</span>
      <span className="font-bold tabular-nums text-accent">{fmtYen(r.currentPrice, locale)}</span>
      {sale && (
        <span className="inline-flex items-center gap-1 rounded-md border border-status-completed/40 bg-status-completed/10 px-1.5 py-0.5 text-[10px] text-status-completed">
          <BadgePercent className="h-3 w-3" aria-hidden />
          {fmtYen(r.originalPrice, locale)}
          {r.discountRate != null && ` / -${r.discountRate}%`}
        </span>
      )}
      {r.condition && <span className="text-[10px] text-muted">{r.condition}</span>}
      {r.conditionNote && <span className="text-[10px] text-muted">{r.conditionNote}</span>}
      {productHref && (
        <a
          href={productHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
          aria-label={`${t.erogePrice.openOnRetailer}: ${r.retailerName}`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> {r.retailerName}
        </a>
      )}
    </li>
  );
}

const RETAILER_PAGE_SIZE = 8;

/**
 * Renders a retailer list capped at `RETAILER_PAGE_SIZE` rows with a
 * show-more / show-less toggle for the remainder. Keeps a long
 * DOWNLOAD / PACKAGE retailer list from flooding the panel while still
 * letting the operator expand to the full set and collapse it back on
 * demand.
 */
function RetailerList({ retailers, label, edition }: { retailers: EpApiRetailer[]; label: string; edition: 'dl' | 'pkg' }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? retailers : retailers.slice(0, RETAILER_PAGE_SIZE);
  const hidden = retailers.length - visible.length;
  const hasOverflow = retailers.length > RETAILER_PAGE_SIZE;
  return (
    <ul className="rounded-lg border border-border bg-bg-elev/30 px-3 py-2">
      {visible.map((r) => (
        <RetailerRow key={`${edition}-${r.retailerId}`} r={r} label={label} />
      ))}
      {hasOverflow && (
        <li className="border-t border-border/60 pt-2 first:border-t-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? t.common.close : `${t.erogePrice.retailers} +${hidden}`}
            className="btn btn-xs min-h-[44px] text-muted hover:text-accent sm:min-h-0"
          >
            {expanded ? t.common.close : `+${hidden}`}
          </button>
        </li>
      )}
    </ul>
  );
}

function StaffBlock({ staff }: { staff: EpApiStaff }) {
  const t = useT();
  const locale = useLocale();
  const rows: { label: string; icon: React.ReactNode; names: string[] }[] = [
    { label: t.erogePrice.staff.scenario, icon: <Pencil className="h-3 w-3" aria-hidden />, names: staff.scenario },
    { label: t.erogePrice.staff.illustration, icon: <Pencil className="h-3 w-3" aria-hidden />, names: staff.illustration },
    { label: t.erogePrice.staff.music, icon: <Music2 className="h-3 w-3" aria-hidden />, names: staff.music },
    { label: t.erogePrice.staff.singer, icon: <Music2 className="h-3 w-3" aria-hidden />, names: staff.singer },
    { label: t.erogePrice.staff.voice, icon: <Mic2 className="h-3 w-3" aria-hidden />, names: staff.voice },
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows
        .filter((r) => r.names.length > 0)
        .map((r) => (
          <div key={r.label} className="contents">
            <dt className="inline-flex items-center gap-1 font-semibold text-muted">
              {r.icon}
              {r.label}
            </dt>
            <dd className="text-white">{r.names.join(locale === 'ja' ? '、' : ', ')}</dd>
          </div>
        ))}
    </dl>
  );
}

function RelatedRail({
  title,
  items,
  vnMatches,
}: {
  title: string;
  items: (EpApiRelatedItem | EpApiRelatedConnection)[];
  vnMatches?: Map<string, string>;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
      <ul className="scroll-fade-right -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="list">
        {items.map((item) => {
          const epLink = `https://eroge-price.com/games/${item.id}`;
          const vnId = vnMatches?.get(item.title);
          const mainHref = vnId ? `/vn/${vnId}` : epLink;
          const kindLabel = 'kindLabel' in item ? item.kindLabel : null;
          return (
            <li key={item.id} className="shrink-0">
              <div className="w-[110px] rounded-lg border border-border bg-bg-card p-1.5 hover:border-accent">
                <a
                  href={mainHref}
                  {...(vnId ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                  className="block"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-bg-elev">
                    {item.coverImageUrl && (
                      <SafeImage src={item.coverImageUrl} alt={item.title} className="h-full w-full object-cover" />
                    )}
                    {kindLabel && (
                      <span className="absolute left-1 top-1 rounded-md bg-bg/90 px-1 py-0.5 text-[9px] font-bold text-accent">
                        {kindLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-white">{item.title}</p>
                  {item.maker && <p className="text-[10px] text-muted">{item.maker}</p>}
                </a>
                {vnId && (
                  <a
                    href={epLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.erogePrice.openOnErogePrice}
                    className="mt-1 flex min-h-[44px] items-center justify-center gap-1 rounded-md border border-border/60 px-1 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
                  >
                    <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    EP
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const RANGE_OPTIONS = [
  { key: '6M', ms: 180 * 24 * 3600 * 1000 },
  { key: '1Y', ms: 365 * 24 * 3600 * 1000 },
  { key: '2Y', ms: 2 * 365 * 24 * 3600 * 1000 },
  { key: 'ALL', ms: null },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]['key'];

function CandidateCard({ bundle, vnMatches }: { bundle: ErogePriceBundle; vnMatches: Map<string, string> }) {
  const t = useT();
  const locale = useLocale();
  const d = bundle.detail;
  const gameHref = safeHref(bundle.gameUrl);
  const officialSiteHref = safeHref(d.officialSiteUrl);
  const brandSiteHref = safeHref(d.brandSiteUrl);
  const fanzaDownloadHref = d.fanzaDownloadCid
    ? safeHref(`https://dlsoft.dmm.co.jp/detail/${d.fanzaDownloadCid}/`)
    : null;
  const fanzaPackageHref = d.fanzaPackageCid
    ? safeHref(`https://www.dmm.co.jp/mono/pcgame/-/detail/=/cid=${d.fanzaPackageCid}/`)
    : null;
  const [range, setRange] = useState<RangeKey>('2Y');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const filteredHistory = useMemo(() => {
    const opt = RANGE_OPTIONS.find((o) => o.key === range)!;
    if (opt.ms == null) return bundle.priceHistory;
    const cutoff = Date.now() - opt.ms;
    return bundle.priceHistory.filter((p) => new Date(p.scrapedAt).getTime() >= cutoff);
  }, [bundle.priceHistory, range]);

  const allSeries: SparklineSeries[] = useMemo(() => {
    const raw = pointsToSeries(filteredHistory);
    return raw.map((s, i) => ({ ...s, color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] }));
  }, [filteredHistory]);

  const series = allSeries.filter((s) => !hiddenSeries.has(s.label));

  function toggleGroup(edition: 'DL' | 'PKG') {
    const inGroup = allSeries.filter((s) => s.label.endsWith(`(${edition})`));
    const allHidden = inGroup.every((s) => hiddenSeries.has(s.label));
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      for (const s of inGroup) {
        if (allHidden) next.delete(s.label);
        else next.add(s.label);
      }
      return next;
    });
  }

  function toggleOneSeries(label: string) {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const guides: { y: number; label: string; color?: string }[] = [];
  if (bundle.priceStats.allTimeMin != null) {
    guides.push({
      y: bundle.priceStats.allTimeMin,
      label: `${t.erogePrice.stats.allTimeMin} ${fmtYen(bundle.priceStats.allTimeMin, locale)}`,
      color: 'rgb(74, 222, 128)',
    });
  }
  if (bundle.priceStats.allTimeMax != null) {
    guides.push({
      y: bundle.priceStats.allTimeMax,
      label: `${t.erogePrice.stats.allTimeMax} ${fmtYen(bundle.priceStats.allTimeMax, locale)}`,
      color: 'rgb(248, 113, 113)',
    });
  }

  return (
    <article className="space-y-4">
      {/* Identity card */}
      <header className="flex flex-wrap items-start gap-4">
        {d.coverImageUrl && (
          <SafeImage
            src={d.coverImageUrl}
            alt={d.title}
            className="aspect-[2/3] h-32 w-24 shrink-0 rounded-lg border border-border bg-bg-elev object-cover"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-base font-bold text-white">{d.title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {d.maker && <span className="font-semibold text-white">{d.maker}</span>}
            {d.releaseDate && <span>{fmtIsoDate(d.releaseDate, locale)}</span>}
            {d.platform && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5">{d.platform}</span>
            )}
            {d.ageRating && (
              <span className="rounded-md border border-status-on_hold/40 bg-status-on_hold/10 px-1.5 py-0.5 text-status-on_hold">
                {d.ageRating}
              </span>
            )}
            {d.hasDownload && (
              <span className="rounded-md border border-accent-blue/40 bg-accent-blue/10 px-1.5 py-0.5 text-accent-blue">
                {t.erogePrice.editions.download}
              </span>
            )}
            {d.hasPackage && (
              <span className="rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-accent">
                {t.erogePrice.editions.package}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
            {gameHref && (
              <a
                href={gameHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 text-accent hover:underline sm:min-h-0"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.openOnErogePrice}
              </a>
            )}
            {officialSiteHref && (
              <a
                href={officialSiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 text-muted hover:text-accent sm:min-h-0"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.officialSite}
              </a>
            )}
            {brandSiteHref && (
              <a
                href={brandSiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 text-muted hover:text-accent sm:min-h-0"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.brandSite}
              </a>
            )}
            {/* FANZA product ids - when present, link straight to the
                FANZA product page so the operator can cross-reference
                without leaving the panel. The id format is
                `<cid>` and FANZA's canonical URL is
                /digital/pcgame/-/detail/=/cid=<cid>/ */}
            {fanzaDownloadHref && (
              <a
                href={fanzaDownloadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 text-muted hover:text-accent sm:min-h-0"
                title={d.fanzaDownloadCid ?? undefined}
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> FANZA DL
              </a>
            )}
            {fanzaPackageHref && (
              <a
                href={fanzaPackageHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 text-muted hover:text-accent sm:min-h-0"
                title={d.fanzaPackageCid ?? undefined}
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> FANZA PKG
              </a>
            )}
          </div>
          {/* Genres - render as small unobtrusive chips next to the
              identity row so the operator can see at a glance whether
              eroge-price has the title classified the same way as
              their VNDB tags. */}
          {d.genres && d.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {d.genres.slice(0, 12).map((g) => (
                <span
                  key={g}
                  className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5 text-[10px] text-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          {/* Description - long, but worth surfacing collapsed. */}
          {d.description && (
            <details className="pt-2 text-[11px] text-muted">
              <summary className="cursor-pointer text-muted hover:text-accent">
                {t.erogePrice.descriptionLabel}
              </summary>
              <p className="mt-1 whitespace-pre-line text-white/80">{d.description}</p>
            </details>
          )}
        </div>
      </header>

      {/* Stats trio */}
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat
          icon={<TrendingDown className="h-3.5 w-3.5 text-status-completed" aria-hidden />}
          label={t.erogePrice.stats.allTimeMin}
          value={fmtYen(bundle.priceStats.allTimeMin, locale)}
          note={bundle.priceStats.allTimeMinNote}
        />
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5 text-status-dropped" aria-hidden />}
          label={t.erogePrice.stats.allTimeMax}
          value={fmtYen(bundle.priceStats.allTimeMax, locale)}
          note={bundle.priceStats.allTimeMaxNote}
        />
        <Stat
          icon={<Crown className="h-3.5 w-3.5 text-accent" aria-hidden />}
          label={t.erogePrice.stats.thirtyDayMin}
          value={fmtYen(bundle.priceStats.thirtyDayMin, locale)}
          note={bundle.priceStats.thirtyDayMinNote}
        />
      </section>

      {/* Price-history chart */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t.erogePrice.priceHistory} / {bundle.priceHistory.length} {t.erogePrice.dataPoints}
          </h4>
          <div className="flex gap-1" role="group" aria-label={t.erogePrice.priceHistory}>
            {RANGE_OPTIONS.map((opt) => {
              const label = t.erogePrice.historyRange[
                opt.key === '6M' ? 'sixMonths' : opt.key === '1Y' ? 'oneYear' : opt.key === '2Y' ? 'twoYears' : 'allTime'
              ];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`min-h-[44px] rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors sm:min-h-0 ${
                    range === opt.key
                      ? 'bg-accent text-white'
                      : 'border border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {allSeries.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {(['DL', 'PKG'] as const).map((edition) => {
              const inGroup = allSeries.filter((s) => s.label.endsWith(`(${edition})`));
              if (inGroup.length === 0) return null;
              const allHidden = inGroup.every((s) => hiddenSeries.has(s.label));
              return (
                <button
                  key={edition}
                  type="button"
                  onClick={() => toggleGroup(edition)}
                  className={`min-h-[44px] rounded border px-2 py-0.5 text-[10px] font-bold transition-colors sm:min-h-0 ${
                    allHidden
                      ? 'border-border text-muted opacity-50'
                      : 'border-accent/60 bg-accent/10 text-accent'
                  }`}
                >
                  {edition}
                </button>
              );
            })}
            <span className="mx-0.5 self-center text-[10px] text-border/60">/</span>
            {allSeries.map((s) => {
              const hidden = hiddenSeries.has(s.label);
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggleOneSeries(s.label)}
                  className={`flex min-h-[44px] items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors sm:min-h-0 ${
                    hidden ? 'border-border opacity-40' : 'border-border/60 text-white hover:border-accent/60'
                  }`}
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className={hidden ? 'line-through text-muted' : ''}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <PriceHistoryChart
          series={series}
          locale={locale}
          guides={guides}
          ariaLabel={`${t.erogePrice.priceHistory}: ${d.title}`}
          formatYen={(y) => fmtYen(y, locale)}
          hideLegend
        />
      </section>

      {/* Per-edition retailer rows */}
      {(d.downloadRetailers.length > 0 || d.packageRetailers.length > 0) && (
        <section className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t.erogePrice.retailers}
          </h4>
          {d.downloadRetailers.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted/70">
                {t.erogePrice.editions.download}
              </p>
              <RetailerList retailers={d.downloadRetailers} label={t.erogePrice.editions.dlShort} edition="dl" />
            </div>
          )}
          {d.packageRetailers.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted/70">
                {t.erogePrice.editions.package}
              </p>
              <RetailerList retailers={d.packageRetailers} label={t.erogePrice.editions.pkgShort} edition="pkg" />
            </div>
          )}
        </section>
      )}

      {/* Staff block */}
      {(d.mainStaff.scenario.length > 0 ||
        d.mainStaff.illustration.length > 0 ||
        d.mainStaff.music.length > 0 ||
        d.mainStaff.singer.length > 0 ||
        d.mainStaff.voice.length > 0) && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t.erogePrice.staff.title}
          </h4>
          <StaffBlock staff={d.mainStaff} />
        </section>
      )}

      {/* Related */}
      {bundle.related.connections.length > 0 && (
        <RelatedRail title={t.erogePrice.related.connections} items={bundle.related.connections} vnMatches={vnMatches} />
      )}
      {bundle.related.sameBrand.length > 0 && (
        <RelatedRail title={t.erogePrice.related.sameBrand} items={bundle.related.sameBrand} vnMatches={vnMatches} />
      )}
    </article>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev/30 px-3 py-2">
      <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{value}</p>
      {note && <p className="mt-0.5 text-[10px] text-muted">{note}</p>}
    </div>
  );
}

export function ErogePricePanel({ vnId, extras: initialExtras }: Props) {
  const t = useT();
  const toast = useToast();
  const [extras, setExtras] = useState<ErogePriceExtrasV1>(initialExtras);
  const [activeId, setActiveId] = useState<number>(
    initialExtras.selectedEpId ?? initialExtras.candidates[0]?.epId ?? 0,
  );
  const [pinState, setPinState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addState, setAddState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [addError, setAddError] = useState<string | null>(null);
  const [removingEpId, setRemovingEpId] = useState<number | null>(null);
  const [vnMatches, setVnMatches] = useState<Map<string, string>>(new Map());
  const identityRef = useRef(vnId);
  const mountedRef = useRef(true);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setExtras(initialExtras);
    setActiveId(initialExtras.selectedEpId ?? initialExtras.candidates[0]?.epId ?? 0);
    setPinState('idle');
    setAddOpen(false);
    setAddInput('');
    setAddState('idle');
    setAddError(null);
    setRemovingEpId(null);
    setVnMatches(new Map());
    return () => {
      mountedRef.current = false;
      mutationAbortRef.current?.abort();
    };
  }, [vnId, initialExtras]);

  useEffect(() => {
    const allItems = extras.candidates.flatMap((c) => [
      ...c.related.sameBrand,
      ...c.related.connections,
    ]);
    const titles = [...new Set(allItems.map((i) => i.title))].filter(Boolean);
    if (titles.length === 0) {
      setVnMatches(new Map());
      return;
    }
    const params = new URLSearchParams();
    for (const t of titles) params.append('q', t);
    const ac = new AbortController();
    fetch(`/api/stock/resolve-titles?${params.toString()}`, {
      cache: 'no-store',
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = decodeStockTitleResolutionMap(await r.json());
        if (!data) throw new Error(t.common.error);
        return data;
      })
      .then((data) => {
        if (ac.signal.aborted) return;
        const m = new Map<string, string>();
        for (const [title, match] of Object.entries(data)) {
          if (match) m.set(title, match.vnId);
        }
        setVnMatches(m);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [extras.candidates, t.common.error]);

  if (extras.candidates.length === 0) return null;
  const active = extras.candidates.find((c) => c.epId === activeId) ?? extras.candidates[0];
  const primaryId = extras.selectedEpId;
  const isActiveAlreadyPrimary = primaryId === active.epId;
  const candidateMutationBusy = pinState === 'saving' || addState === 'saving' || removingEpId != null;

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return mountedRef.current &&
      identityRef.current === ownerVnId &&
      mutationAbortRef.current === controller &&
      !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    if (mountedRef.current) setRemovingEpId(null);
  }

  const handleSetPrimary = async () => {
    if (isActiveAlreadyPrimary) return;
    const controller = beginMutation();
    if (!controller) return;
    const ownerVnId = vnId;
    const previous = primaryId;
    setPinState('saving');
    setExtras((s) => ({ ...s, selectedEpId: active.epId }));
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/eroge-price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ep_id: active.epId }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.erogePrice.manualMatch.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      setPinState('idle');
      toast.success(t.erogePrice.manualMatch.saved);
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      setExtras((s) => ({ ...s, selectedEpId: previous }));
      setPinState('error');
      toast.error((e as Error).message || t.erogePrice.manualMatch.error);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  };

  const handleAdd = async () => {
    const id = Number(addInput.trim());
    if (!Number.isSafeInteger(id) || id <= 0) {
      setAddError(t.erogePrice.manualMatch.invalidEpId);
      setAddState('error');
      toast.error(t.erogePrice.manualMatch.invalidEpId);
      return;
    }
    const controller = beginMutation();
    if (!controller) return;
    const ownerVnId = vnId;
    setAddState('saving');
    setAddError(null);
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/eroge-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ep_id: id }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.erogePrice.manualMatch.addError));
      if (!ownsMutation(ownerVnId, controller)) return;
      const snapshotRes = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!snapshotRes.ok) {
        throw new Error(await readApiError(snapshotRes, t.erogePrice.manualMatch.addError));
      }
      const snapshot = decodeStockSnapshot(await snapshotRes.json());
      if (!snapshot) throw new Error(t.erogePrice.manualMatch.addError);
      const row = snapshot.statuses.find((s) => s.provider === 'eroge_price');
      const next = decodeStoredExtras(row?.extras_json);
      if (!next) throw new Error(t.erogePrice.manualMatch.addError);
      if (!ownsMutation(ownerVnId, controller)) return;
      setExtras(next);
      setAddInput('');
      setAddOpen(false);
      setAddState('idle');
      toast.success(t.erogePrice.manualMatch.addSuccess);
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      const message = (e as Error).message;
      setAddError(message);
      setAddState('error');
      toast.error(message || t.erogePrice.manualMatch.addError);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  };

  const handleRemove = async (epId: number) => {
    if (extras.candidates.length <= 1) return;
    const controller = beginMutation();
    if (!controller) return;
    const ownerVnId = vnId;
    const wasPrimary = primaryId === epId;
    const prev = extras;
    const nextActiveId =
      activeId === epId
        ? extras.candidates.find((candidate) => candidate.epId !== epId)?.epId ?? activeId
        : activeId;
    setRemovingEpId(epId);
    setExtras((s) => {
      const remaining = s.candidates.filter((c) => c.epId !== epId);
      return {
        ...s,
        candidates: remaining,
        selectedEpId: wasPrimary ? remaining[0]?.epId ?? null : s.selectedEpId,
      };
    });
    setActiveId(nextActiveId);
    try {
      const r = await fetch(
        `/api/vn/${encodeURIComponent(vnId)}/stock/eroge-price?ep_id=${encodeURIComponent(epId)}`,
        { method: 'DELETE', signal: controller.signal },
      );
      if (!r.ok) throw new Error(await readApiError(r, t.erogePrice.manualMatch.removeError));
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      setExtras(prev);
      setActiveId(activeId);
      toast.error((e as Error).message || t.erogePrice.manualMatch.removeError);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  };

  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4"
      aria-label={t.erogePrice.panelTitle}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{t.erogePrice.panelTitle}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
          {extras.searchQuery && (
            <span>
              {t.erogePrice.searchedAs}: <span className="font-mono">{extras.searchQuery}</span> /{' '}
              {extras.candidates.length} {t.erogePrice.matchCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setAddOpen((v) => !v);
              setAddError(null);
            }}
            disabled={candidateMutationBusy}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 hover:border-accent hover:text-accent sm:min-h-0"
            aria-expanded={addOpen}
          >
            <Plus className="h-3 w-3" aria-hidden /> {t.erogePrice.manualMatch.addCandidate}
          </button>
        </div>
      </header>

      {addOpen && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elev/30 p-2 text-[11px]">
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-muted">{t.erogePrice.manualMatch.addCandidateHint}</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              disabled={candidateMutationBusy}
              placeholder={t.erogePrice.manualMatch.addCandidatePlaceholder}
              className="min-h-[44px] w-32 rounded-md border border-border bg-bg px-2 py-1 text-white sm:min-h-0"
            />
          </label>
          <button
            type="button"
            onClick={handleAdd}
            disabled={candidateMutationBusy || !addInput.trim()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-accent/60 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20 disabled:cursor-progress disabled:opacity-50 sm:min-h-0"
          >
            {addState === 'saving' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {addState === 'saving'
              ? t.erogePrice.manualMatch.saving
              : t.erogePrice.manualMatch.confirmAdd}
          </button>
          {addError && (
            <span className="text-status-dropped" role="alert">
              {addError}
            </span>
          )}
        </div>
      )}

      {extras.candidates.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t.erogePrice.candidates}>
          {extras.candidates.map((c) => {
            const isActive = c.epId === activeId;
            const isPrimary = c.epId === primaryId;
            return (
              <div key={c.epId} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveId(c.epId)}
                  disabled={candidateMutationBusy}
                  className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-xs sm:min-h-0 ${
                    isActive
                      ? 'border-accent bg-accent/15 font-bold text-accent'
                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {isPrimary && (
                    <>
                      <Pin
                        className="-ml-0.5 mr-1 inline-block h-3 w-3 rounded-full bg-accent p-0.5 text-bg"
                        aria-hidden />
                      <span className="sr-only">{t.erogePrice.manualMatch.primaryBadge}</span>
                    </>
                  )}
                  <span>{c.detail.title}</span>
                  <span className="ml-1.5 text-[10px] opacity-80">
                    {c.detail.releaseDate ? new Date(c.detail.releaseDate).getFullYear() : c.epId}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(c.epId);
                  }}
                  disabled={candidateMutationBusy}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-bg text-muted hover:border-status-dropped hover:text-status-dropped disabled:cursor-progress disabled:opacity-50 sm:min-h-0 sm:min-w-[28px]"
                  title={t.erogePrice.manualMatch.removeCandidate}
                  aria-label={`${t.erogePrice.manualMatch.removeCandidate}: ${c.detail.title}`}
                >
                  {removingEpId === c.epId ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {extras.candidates.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          {isActiveAlreadyPrimary ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">
              <Pin className="h-3 w-3" aria-hidden /> {t.erogePrice.manualMatch.primaryBadge}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSetPrimary}
              disabled={candidateMutationBusy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-muted hover:border-accent hover:text-accent disabled:cursor-progress disabled:opacity-50 sm:min-h-0"
              title={t.erogePrice.manualMatch.setPrimaryHint}
            >
              {pinState === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Pin className="h-3 w-3" aria-hidden />}
              {pinState === 'saving'
                ? t.erogePrice.manualMatch.saving
                : t.erogePrice.manualMatch.setPrimary}
            </button>
          )}
          {pinState === 'error' && (
            <span className="text-status-dropped" role="alert">
              {t.erogePrice.manualMatch.error}
            </span>
          )}
        </div>
      )}

      <CandidateCard key={active.epId} bundle={active} vnMatches={vnMatches} />
    </section>
  );
}
