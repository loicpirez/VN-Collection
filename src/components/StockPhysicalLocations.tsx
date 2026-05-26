'use client';
import { MapPin } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import type { VnStockAvailability } from '@/lib/db';

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

/** Pure presentational component — receives pre-filtered physical offers. */
export function StockPhysicalLocations({ offers }: { offers: PhysicalOffer[] }) {
  const t = useT();
  const locale = useLocale();

  const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        {t.stock.physicalLocations as string}
      </h3>
      <p className="mt-1 text-[11px] text-muted">{t.stock.physicalLocationsHint as string}</p>
      {offers.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">{t.stock.physicalLocationsEmpty as string}</p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {offers.map((offer, i) => (
            <li
              key={`${offer.provider}:${offer.location_branch ?? offer.location_label ?? i}`}
              className="flex items-start justify-between gap-2 rounded-lg border border-border bg-bg-elev/50 p-2"
            >
              <div className="min-w-0">
                <span className="block truncate text-xs font-bold text-white">{offer.location_branch ?? offer.location_label}</span>
                <span className="block truncate text-[11px] text-muted">{offer.title}</span>
                {offer.condition && (
                  <span className="mt-0.5 inline-block rounded bg-bg px-1.5 py-0.5 text-[10px] text-muted">{offer.condition}</span>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-sm font-black text-accent">
                  {offer.price != null ? currency.format(offer.price) : '—'}
                </span>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-[10px] text-muted hover:text-accent"
                >
                  {offer.provider_label}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
