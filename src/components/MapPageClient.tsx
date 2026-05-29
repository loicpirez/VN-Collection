'use client';
import dynamic from 'next/dynamic';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';

const MapCanvas = dynamic(() => import('./MapCanvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] min-h-[400px] w-full items-center justify-center rounded-xl border border-border bg-bg-card text-sm text-muted">
      {/* loading state rendered below via the map.loadingMap key */}
    </div>
  ),
});

interface Props {
  places: PlaceWithLinks[];
  focusLat?: number | null;
  focusLng?: number | null;
}

export function MapPageClient({ places, focusLat, focusLng }: Props) {
  const t = useT();
  const withCoords = places.filter((p) => p.lat != null && p.lng != null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">{t.map.title as string}</h1>
        <p className="mt-1 text-sm text-muted">{t.map.subtitle as string}</p>
      </div>

      {withCoords.length === 0 ? (
        <p className="text-sm text-muted">{t.map.noPlaces as string}</p>
      ) : (
        <MapCanvas
          places={withCoords}
          focusLat={focusLat}
          focusLng={focusLng}
          popupOpenLabel={t.map.popupOpen as string}
          popupStockLabel={(n) => (t.map.popupStock as string).replace('{n}', String(n))}
          popupBranchesLabel={(n) => (t.map.popupBranches as string).replace('{n}', String(n))}
        />
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {withCoords.map((place) => (
          <a
            key={place.id}
            href={`/places/${place.id}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-bg-card px-4 py-3 hover:border-accent/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{place.name}</p>
              {place.name_ja && (
                <p className="text-[11px] text-muted truncate">{place.name_ja}</p>
              )}
            </div>
            <div className="shrink-0 text-right text-[11px] text-muted">
              <p className="text-accent font-bold">
                {place.stock_count > 0
                  ? (t.map.popupStock as string).replace('{n}', String(place.stock_count))
                  : (t.places.noStock as string)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
