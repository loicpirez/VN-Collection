import { listPlaces } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { MapPageClient } from '@/components/MapPageClient';

type Props = { searchParams: Promise<{ lat?: string; lng?: string; id?: string }> };

export async function generateMetadata() {
  const t = await getDict();
  return { title: `${t.map.title} — ${t.app.title}` };
}

export default async function MapPage({ searchParams }: Props) {
  const params = await searchParams;
  const places = listPlaces();
  const focusLat = params.lat ? Number(params.lat) : null;
  const focusLng = params.lng ? Number(params.lng) : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <MapPageClient
        places={places}
        focusLat={focusLat}
        focusLng={focusLng}
      />
    </main>
  );
}
