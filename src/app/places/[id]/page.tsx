import { notFound } from 'next/navigation';
import { getPlace } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { PlaceDetailClient } from '@/components/PlaceDetailClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const place = getPlace(Number(id));
  const t = await getDict();
  if (!place) return { title: t.places.title };
  return { title: `${place.name} | ${t.places.title}` };
}

export default async function PlacePage({ params }: Props) {
  const { id } = await params;
  const place = getPlace(Number(id));
  if (!place) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PlaceDetailClient place={place} />
    </section>
  );
}
