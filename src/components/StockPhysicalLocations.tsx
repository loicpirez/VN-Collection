'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import type { VnStockAvailability } from '@/lib/db';

/**
 * Mirror of LEGACY_CONDITION_MAP in StockPanel.tsx so legacy server-emitted
 * English condition strings ('Used', 'New', 'Sealed') resolve to the
 * localised label at render time. Kept inline (small) rather than exporting
 * from StockPanel.tsx to avoid creating a circular client-only dependency.
 */
const LEGACY_CONDITION_MAP: Record<string, string> = {
  'New': 'new',
  'Used': 'used',
  'Sealed': 'sealed',
};

function conditionLabel(
  t: ReturnType<typeof useT>,
  raw: string,
): string {
  const slug = LEGACY_CONDITION_MAP[raw] ?? raw;
  const dict = t.stock.conditionLabels as Record<string, string | undefined>;
  return dict[slug] ?? raw;
}

export interface PhysicalOffer {
  provider: string;
  provider_label: string;
  title: string;
  url: string;
  price: number | null;
  availability: VnStockAvailability;
  location_label: string | null;
  location_branch: string | null;
  condition: string | null;
}

/**
 * Sort key: cheapest first when both have prices, otherwise priced entries
 * before unpriced. Stable inside a group via the original index.
 */
function sortKey(a: PhysicalOffer, b: PhysicalOffer): number {
  if (a.price != null && b.price != null) return a.price - b.price;
  if (a.price != null) return -1;
  if (b.price != null) return 1;
  return 0;
}

/** Pure presentational component — receives pre-filtered physical offers. */
export function StockPhysicalLocations({
  offers,
  placeMap = {},
}: {
  offers: PhysicalOffer[];
  placeMap?: Record<string, number>;
}) {
  const t = useT();
  const locale = useLocale();

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }),
    [locale],
  );

  // Group by branch. Branch can be null — fall back to provider label.
  const grouped = useMemo(() => {
    const map = new Map<string, PhysicalOffer[]>();
    for (const offer of offers) {
      const key = offer.location_branch?.trim() || offer.location_label?.trim() || offer.provider_label;
      const list = map.get(key) ?? [];
      list.push(offer);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([branch, list]) => ({ branch, offers: [...list].sort(sortKey) }))
      .sort((a, b) => {
        const aMin = a.offers[0]?.price ?? Number.MAX_SAFE_INTEGER;
        const bMin = b.offers[0]?.price ?? Number.MAX_SAFE_INTEGER;
        return aMin - bMin;
      });
  }, [offers]);

  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        {t.stock.physicalLocations as string}
        {offers.length > 0 && (
          <span className="ml-1 rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted" aria-label={String(offers.length)}>
            {offers.length}
          </span>
        )}
      </h3>
      <p className="mt-1 text-[11px] text-muted">{t.stock.physicalLocationsHint as string}</p>
      {offers.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">{t.stock.physicalLocationsEmpty as string}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {grouped.map(({ branch, offers: branchOffers }) => (
            <div key={branch} className="rounded-lg border border-border bg-bg-elev/50 p-2">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                {placeMap[branch] != null ? (
                  <Link
                    href={`/places/${placeMap[branch]}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                  >
                    <MapPin className="h-3 w-3" aria-hidden />
                    {branch}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white">
                    <MapPin className="h-3 w-3 text-accent" aria-hidden />
                    {branch}
                  </span>
                )}
                {branchOffers.length > 1 && (
                  <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-muted" aria-label={`${branchOffers.length}`}>
                    {branchOffers.length}
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {branchOffers.map((offer, i) => (
                  <li
                    key={`${offer.provider}:${offer.url}:${i}`}
                    className="flex items-start justify-between gap-2 rounded border border-border/60 bg-bg/60 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-[11px] text-white">{offer.title}</span>
                      <span className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-[10px] text-muted">
                        <span className="rounded bg-bg-elev px-1 py-0.5">{offer.provider_label}</span>
                        {offer.condition && (
                          <span className="rounded bg-bg-elev px-1 py-0.5">{conditionLabel(t, offer.condition)}</span>
                        )}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-xs font-black text-accent">
                        {offer.price != null ? currency.format(offer.price) : '—'}
                      </span>
                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t.stock.openShop} — ${offer.provider_label}`}
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {t.stock.openShop}
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
