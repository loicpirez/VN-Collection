'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';

const MapCanvas = dynamic(() => import('./MapCanvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <MapLoadingPlaceholder />
  ),
});

function MapLoadingPlaceholder() {
  const t = useT();
  return (
    <div className="flex h-[60vh] min-h-[400px] w-full items-center justify-center rounded-xl border border-border bg-bg-card text-sm text-muted">
      {t.map.loadingMap as string}
    </div>
  );
}

interface Props {
  places: PlaceWithLinks[];
  focusLat?: number | null;
  focusLng?: number | null;
  focusId?: number | null;
}

export function MapPageClient({ places, focusLat, focusLng, focusId }: Props) {
  const t = useT();
  const withCoords = places.filter((p) => p.lat != null && p.lng != null);
  const withoutCoords = places.filter((p) => p.lat == null || p.lng == null);

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
          focusId={focusId}
          popupOpenLabel={t.map.popupOpen as string}
          popupStockLabel={(n) => (t.map.popupStock as string).replace('{n}', String(n))}
          popupBranchesLabel={(n) => (t.map.popupBranches as string).replace('{n}', String(n))}
        />
      )}

      <div className="mt-6 space-y-2">
        {withCoords.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{t.map.allPlaces as string}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {withCoords.map((place) => (
                <PlaceSidebarItem key={place.id} place={place} t={t} focused={focusId === place.id} />
              ))}
            </div>
          </div>
        )}

        {withoutCoords.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{t.map.noCoords as string}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {withoutCoords.map((place) => (
                <PlaceSidebarItem key={place.id} place={place} t={t} focused={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceSidebarItem({
  place,
  t,
  focused,
}: {
  place: PlaceWithLinks;
  t: ReturnType<typeof useT>;
  focused: boolean;
}) {
  return (
    <Link
      href={`/places/${place.id}`}
      className={`flex items-center gap-3 rounded-lg border bg-bg-card px-4 py-3 hover:border-accent/40 transition-colors ${focused ? 'border-accent/60 bg-accent/5' : 'border-border'}`}
    >
      <MapPin className={`h-3.5 w-3.5 shrink-0 ${place.lat != null ? 'text-accent' : 'text-muted/40'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{place.name}</p>
        {place.name_ja && (
          <p className="text-[11px] text-muted truncate">{place.name_ja}</p>
        )}
      </div>
      <div className="shrink-0 text-right text-[11px]">
        {place.stock_count > 0 ? (
          <p className="font-bold text-accent">
            {(t.map.popupStock as string).replace('{n}', String(place.stock_count))}
          </p>
        ) : (
          <p className="text-muted">{t.places.noStock as string}</p>
        )}
      </div>
    </Link>
  );
}
