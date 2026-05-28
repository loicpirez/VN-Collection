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
 *    (`<PriceHistoryChart>` — one series per retailer × edition pair)
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
import { useState } from 'react';
import { ExternalLink, BadgePercent, Crown, Pin, TrendingDown, TrendingUp, Mic2, Pencil, Music2 } from 'lucide-react';
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
import { fmtNum } from '@/lib/locale-number';
import { SafeImage } from './SafeImage';
import { PriceHistoryChart, type SparklineSeries } from './charts/Sparkline';

interface Props {
  /**
   * VNDB VN id (or `egs_<n>` synthetic) — needed so the "Set as
   * primary" button can PATCH the persisted extras_json envelope
   * via `/api/vn/<vnId>/stock/eroge-price`. Without it the manual
   * matching UI would only update local state and silently revert
   * on the next stock refresh.
   */
  vnId: string;
  extras: ErogePriceExtrasV1;
}

function fmtYen(yen: number | null | undefined, locale: 'fr' | 'en' | 'ja'): string {
  if (yen == null) return '—';
  return `¥${fmtNum(yen, locale, 0)}`;
}

function fmtIsoDate(iso: string | null, locale: 'fr' | 'en' | 'ja'): string {
  if (!iso) return '—';
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
 * Build one `SparklineSeries` per (retailer × edition) tuple from the
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
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-border/60 py-2 text-xs first:border-t-0">
      <span className="min-w-[6rem] font-semibold text-white">{r.retailerName}</span>
      <span className="rounded-md border border-border bg-bg-elev/40 px-1.5 py-0.5 text-[10px] text-muted">{label}</span>
      <span className="font-bold tabular-nums text-accent">{fmtYen(r.currentPrice, locale)}</span>
      {sale && (
        <span className="inline-flex items-center gap-1 rounded-md border border-status-completed/40 bg-status-completed/10 px-1.5 py-0.5 text-[10px] text-status-completed">
          <BadgePercent className="h-3 w-3" aria-hidden />
          {fmtYen(r.originalPrice, locale)}
          {r.discountRate != null && ` · -${r.discountRate}%`}
        </span>
      )}
      {r.condition && <span className="text-[10px] text-muted">{r.condition}</span>}
      {r.conditionNote && <span className="text-[10px] text-muted">{r.conditionNote}</span>}
      <a
        href={r.productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:border-accent hover:text-accent"
        aria-label={`${t.erogePrice.openOnRetailer} · ${r.retailerName}`}
      >
        <ExternalLink className="h-3 w-3" aria-hidden /> {r.retailerName}
      </a>
    </li>
  );
}

function StaffBlock({ staff }: { staff: EpApiStaff }) {
  const t = useT();
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
            <dd className="text-white">{r.names.join('、')}</dd>
          </div>
        ))}
    </dl>
  );
}

function RelatedRail({
  title,
  items,
}: {
  title: string;
  items: (EpApiRelatedItem | EpApiRelatedConnection)[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
      <ul className="scroll-fade-right -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="list">
        {items.map((item) => {
          const link = `https://eroge-price.com/games/${item.id}`;
          const kindLabel = 'kindLabel' in item ? item.kindLabel : null;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-[110px] rounded-lg border border-border bg-bg-card p-1.5 hover:border-accent"
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CandidateCard({ bundle }: { bundle: ErogePriceBundle }) {
  const t = useT();
  const locale = useLocale();
  const d = bundle.detail;
  const series = pointsToSeries(bundle.priceHistory);
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
            <a
              href={bundle.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.openOnErogePrice}
            </a>
            {d.officialSiteUrl && (
              <a
                href={d.officialSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted hover:text-accent"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.officialSite}
              </a>
            )}
            {d.brandSiteUrl && (
              <a
                href={d.brandSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted hover:text-accent"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.erogePrice.brandSite}
              </a>
            )}
          </div>
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
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t.erogePrice.priceHistory} · {bundle.priceHistory.length} {t.erogePrice.dataPoints}
        </h4>
        <PriceHistoryChart
          series={series}
          guides={guides}
          ariaLabel={`${t.erogePrice.priceHistory} — ${d.title}`}
          formatYen={(y) => fmtYen(y, locale)}
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
              <ul className="rounded-lg border border-border bg-bg-elev/30 px-3 py-2">
                {d.downloadRetailers.map((r) => (
                  <RetailerRow key={`dl-${r.retailerId}`} r={r} label="DL" />
                ))}
              </ul>
            </div>
          )}
          {d.packageRetailers.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted/70">
                {t.erogePrice.editions.package}
              </p>
              <ul className="rounded-lg border border-border bg-bg-elev/30 px-3 py-2">
                {d.packageRetailers.map((r) => (
                  <RetailerRow key={`pkg-${r.retailerId}`} r={r} label="PKG" />
                ))}
              </ul>
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
        <RelatedRail title={t.erogePrice.related.connections} items={bundle.related.connections} />
      )}
      {bundle.related.sameBrand.length > 0 && (
        <RelatedRail title={t.erogePrice.related.sameBrand} items={bundle.related.sameBrand} />
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

export function ErogePricePanel({ vnId, extras }: Props) {
  const t = useT();
  // Two pieces of state:
  //   - `activeId` controls which tab body is visible (a transient
  //     "preview" affordance — operator can browse without committing)
  //   - `primaryId` mirrors `extras.selectedEgsId`, optimistically
  //     updated when the operator clicks "Set as primary". The
  //     refresh-survives-pin guarantee lives server-side; this
  //     mirror keeps the badge in sync without a full router refresh.
  const [activeId, setActiveId] = useState<number>(
    extras.selectedEgsId ?? extras.candidates[0]?.egsId ?? 0,
  );
  const [primaryId, setPrimaryId] = useState<number | null>(extras.selectedEgsId);
  const [pinState, setPinState] = useState<'idle' | 'saving' | 'error'>('idle');

  if (extras.candidates.length === 0) return null;
  const active = extras.candidates.find((c) => c.egsId === activeId) ?? extras.candidates[0];
  const isActiveAlreadyPrimary = primaryId === active.egsId;

  const handleSetPrimary = async () => {
    if (isActiveAlreadyPrimary) return;
    const previous = primaryId;
    setPinState('saving');
    setPrimaryId(active.egsId); // optimistic
    try {
      const r = await fetch(`/api/vn/${encodeURIComponent(vnId)}/stock/eroge-price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egs_id: active.egsId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPinState('idle');
    } catch {
      setPrimaryId(previous); // rollback
      setPinState('error');
    }
  };

  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4"
      aria-label={t.erogePrice.panelTitle}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{t.erogePrice.panelTitle}</h2>
        {extras.searchQuery && (
          <span className="text-[10px] text-muted">
            {t.erogePrice.searchedAs}: <span className="font-mono">{extras.searchQuery}</span> ·{' '}
            {extras.candidates.length} {t.erogePrice.matchCount}
          </span>
        )}
      </header>

      {/* Multi-candidate tabs — operator demand: integrate them all */}
      {extras.candidates.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label={t.erogePrice.candidates}>
          {extras.candidates.map((c) => {
            const isActive = c.egsId === activeId;
            const isPrimary = c.egsId === primaryId;
            return (
              <button
                key={c.egsId}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(c.egsId)}
                className={`tap-target relative rounded-lg border px-3 py-1.5 text-xs ${
                  isActive
                    ? 'border-accent bg-accent/15 font-bold text-accent'
                    : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                }`}
              >
                {isPrimary && (
                  <Pin
                    className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-accent p-0.5 text-bg"
                    aria-label={t.erogePrice.manualMatch.primaryBadge}
                  />
                )}
                <span>{c.detail.title}</span>
                <span className="ml-1.5 text-[10px] opacity-80">
                  {c.detail.releaseDate ? new Date(c.detail.releaseDate).getFullYear() : c.egsId}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Set-as-primary action — only shown when more than one
          candidate AND the active tab is not already the primary.
          Operator gets a visual badge on the tab + a status string
          underneath so they know the click actually persisted. */}
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
              disabled={pinState === 'saving'}
              className="tap-target inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-muted hover:border-accent hover:text-accent disabled:cursor-progress disabled:opacity-50"
              title={t.erogePrice.manualMatch.setPrimaryHint}
            >
              <Pin className="h-3 w-3" aria-hidden />
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

      <CandidateCard bundle={active} />
    </section>
  );
}
