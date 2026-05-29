'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useT } from '@/lib/i18n/client';
import { SafeImage } from './SafeImage';
import { SkeletonCardGrid } from './Skeleton';

interface PlaceVn {
  vn_id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  local_image: string | null;
  min_price: number | null;
  offer_count: number;
  max_updated_at: number;
}

type SortKey = 'title' | 'price' | 'offers' | 'fresh';
type ViewMode = 'cards' | 'list';

const STALE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

interface Props {
  placeId: number;
  placeName: string;
}

function freshness(t: ReturnType<typeof useT>, updatedAt: number): { label: string; stale: boolean; days: number } {
  const days = Math.floor((Date.now() - updatedAt) / MS_PER_DAY);
  if (days <= 0) return { label: t.places.freshUpdatedToday as string, stale: false, days: 0 };
  if (days < STALE_DAYS) {
    return {
      label: (t.places.freshUpdatedDaysAgo as string).replace('{n}', String(days)),
      stale: false,
      days,
    };
  }
  return {
    label: (t.places.freshStale as string).replace('{n}', String(days)),
    stale: true,
    days,
  };
}

export function PlaceVnBrowser({ placeId, placeName: _placeName }: Props) {
  const t = useT();
  const locale = useLocale();
  const [vns, setVns] = useState<PlaceVn[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('title');
  const [view, setView] = useState<ViewMode>('cards');
  const [hideStale, setHideStale] = useState(false);

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }),
    [locale],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/places/${placeId}/stock`);
      const data = await res.json();
      setVns(data.vns ?? []);
    } catch {}
    setLoading(false);
  }, [placeId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => (hideStale ? vns.filter((v) => freshness(t, v.max_updated_at).days < STALE_DAYS) : vns), [vns, hideStale, t]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'price') {
        if (a.min_price != null && b.min_price != null) return a.min_price - b.min_price;
        if (a.min_price != null) return -1;
        if (b.min_price != null) return 1;
        return 0;
      }
      if (sort === 'fresh') return b.max_updated_at - a.max_updated_at;
      return b.offer_count - a.offer_count;
    });
  }, [filtered, sort]);

  const staleCount = useMemo(
    () => vns.filter((v) => freshness(t, v.max_updated_at).stale).length,
    [vns, t],
  );

  const SORTS: { id: SortKey; label: string }[] = [
    { id: 'title', label: t.places.sortTitle as string },
    { id: 'price', label: t.places.sortPrice as string },
    { id: 'offers', label: t.places.sortOffers as string },
    { id: 'fresh', label: t.places.sortFresh as string },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-white">{t.places.vnBrowserTitle as string}</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {SORTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              className={`chip tap-target text-xs ${sort === id ? 'chip-active' : 'text-muted hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {staleCount > 0 && (
          <button
            type="button"
            onClick={() => setHideStale((h) => !h)}
            className={`chip tap-target text-xs ${hideStale ? 'chip-active' : 'text-muted hover:text-white'}`}
            aria-pressed={hideStale}
          >
            {hideStale
              ? (t.places.showStale as string).replace('{n}', String(staleCount))
              : (t.places.hideStale as string).replace('{n}', String(staleCount))}
          </button>
        )}
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setView('cards')}
            className={`chip tap-target text-xs ${view === 'cards' ? 'chip-active' : 'text-muted hover:text-white'}`}
          >
            {t.places.viewCards as string}
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`chip tap-target text-xs ${view === 'list' ? 'chip-active' : 'text-muted hover:text-white'}`}
          >
            {t.places.viewList as string}
          </button>
        </div>
      </div>

      {loading ? (
        view === 'cards' ? <SkeletonCardGrid /> : <div className="text-sm text-muted">{t.places.vnBrowserLoading as string}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted">{vns.length === 0 ? (t.places.vnBrowserEmpty as string) : (t.places.vnBrowserAllFiltered as string)}</p>
      ) : view === 'cards' ? (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 200px)), 1fr))' }}
        >
          {sorted.map((vn) => {
            const f = freshness(t, vn.max_updated_at);
            return (
              <Link
                key={vn.vn_id}
                href={`/vn/${vn.vn_id}`}
                className={`group relative flex flex-col rounded-xl border bg-bg-card overflow-hidden hover:border-accent/40 transition-colors ${f.stale ? 'border-status-on_hold/30' : 'border-border'}`}
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-bg-elev">
                  <SafeImage
                    src={vn.image_url ?? null}
                    localSrc={vn.local_image ?? null}
                    alt={vn.title}
                    fit="cover"
                    className="h-full w-full"
                  />
                </div>
                <div className="p-2">
                  <p className="text-xs font-bold text-white truncate">{vn.title}</p>
                  {vn.alttitle && (
                    <p className="text-[10px] text-muted truncate">{vn.alttitle}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {vn.min_price != null && (
                      <span className="text-[10px] font-black text-accent">
                        {(t.places.minPrice as string).replace('{price}', currency.format(vn.min_price))}
                      </span>
                    )}
                    <span className="text-[10px] text-muted">
                      {(t.places.offers as string).replace('{n}', String(vn.offer_count))}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-[10px] ${f.stale ? 'text-status-on_hold' : 'text-muted/80'}`}
                    title={new Date(vn.max_updated_at).toLocaleString(locale)}
                  >
                    {f.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-1">
          {sorted.map((vn) => {
            const f = freshness(t, vn.max_updated_at);
            return (
              <li key={vn.vn_id}>
                <Link
                  href={`/vn/${vn.vn_id}`}
                  className={`flex items-center gap-3 rounded-lg border bg-bg-card px-4 py-3 hover:border-accent/40 transition-colors ${f.stale ? 'border-status-on_hold/30' : 'border-border'}`}
                >
                  <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-bg-elev">
                    <SafeImage
                      src={vn.image_url ?? null}
                      localSrc={vn.local_image ?? null}
                      alt={vn.title}
                      fit="cover"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{vn.title}</p>
                    {vn.alttitle && (
                      <p className="text-[11px] text-muted truncate">{vn.alttitle}</p>
                    )}
                    <p
                      className={`mt-0.5 text-[10px] ${f.stale ? 'text-status-on_hold' : 'text-muted/70'}`}
                      title={new Date(vn.max_updated_at).toLocaleString(locale)}
                    >
                      {f.label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {vn.min_price != null && (
                      <p className="text-sm font-black text-accent">{currency.format(vn.min_price)}</p>
                    )}
                    <p className="text-[10px] text-muted">
                      {(t.places.offers as string).replace('{n}', String(vn.offer_count))}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
