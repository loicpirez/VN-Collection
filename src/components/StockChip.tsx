'use client';
import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { subscribeStockSummary, type StockSummaryEntry } from '@/lib/stock-summary-client';

/**
 * Renders a small green chip showing offer availability for the given VN,
 * lazy-loaded via IntersectionObserver. The chip only triggers a network
 * request once it scrolls into view, so a 200-card library doesn't fire
 * a /api/stock/summary call for every off-screen tile.
 *
 * Off-screen / no-offers VNs render nothing (DOM stays small).
 */
export function StockChip({ vnId }: { vnId: string }) {
  const t = useT();
  const locale = useLocale();
  const [entry, setEntry] = useState<StockSummaryEntry | null | undefined>(undefined);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let unsub: (() => void) | null = null;
    // P-138: track mount state so the subscribe callback never sets
    // state on an unmounted component (the queue flushes asynchronously
    // and the IO callback can fire just before the unmount tick).
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !unsub) {
            unsub = subscribeStockSummary(vnId, (value) => {
              if (!alive) return;
              setEntry(value);
            });
            io.unobserve(el);
          }
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      unsub?.();
    };
  }, [vnId]);

  // While the IO has not fired or the request is pending, render a tiny
  // placeholder that takes no visual space but keeps the slot.
  if (entry === undefined || entry === null || entry.available <= 0) {
    return <div ref={ref} aria-hidden style={{ width: 0, height: 0 }} />;
  }

  const price = entry.best_price;
  const currencyFmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  });
  const label = price != null
    ? currencyFmt.format(price)
    : (t.stock.stockChipAvailable as string).replace('{count}', String(entry.available));
  const title = (t.stock.stockChipHint as string)
    .replace('{count}', String(entry.available))
    .replace('{price}', price != null ? ` · ${currencyFmt.format(price)}` : '');

  return (
    <div
      ref={ref}
      className="inline-flex items-center gap-1 rounded-md border border-status-completed/40 bg-status-completed/15 px-1.5 py-0.5 text-[10px] font-bold text-status-completed"
      title={title}
      aria-label={title}
    >
      <ShoppingCart className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}
