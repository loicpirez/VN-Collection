import { listPlaces } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { MapPageClient } from '@/components/MapPageClient';
import { hasFiniteCoordinates } from '@/lib/place-coordinates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Props = { searchParams: Promise<{ lat?: string; lng?: string; id?: string; place?: string }> };

export async function generateMetadata() {
  const t = await getDict();
  return { title: t.map.title };
}

export default async function MapPage({ searchParams }: Props) {
  const params = await searchParams;
  const places = listPlaces();
  const requestedFocus = {
    lat: params.lat ? Number(params.lat) : null,
    lng: params.lng ? Number(params.lng) : null,
  };
  const rawId = params.place ?? params.id;
  const focusId = rawId ? Number(rawId) : null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <MapPageClient
        places={places}
        focusLat={hasFiniteCoordinates(requestedFocus) ? requestedFocus.lat : null}
        focusLng={hasFiniteCoordinates(requestedFocus) ? requestedFocus.lng : null}
        focusId={Number.isFinite(focusId) && focusId != null && focusId > 0 ? focusId : null}
      />
    </section>
  );
}
