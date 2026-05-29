import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Globe, Map, ArrowLeft } from 'lucide-react';
import { getPlace } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { PlaceVnBrowser } from '@/components/PlaceVnBrowser';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const place = getPlace(Number(id));
  const t = await getDict();
  if (!place) return { title: t.app.title };
  return { title: `${place.name} — ${t.places.title} — ${t.app.title}` };
}

export default async function PlacePage({ params }: Props) {
  const { id } = await params;
  const place = getPlace(Number(id));
  if (!place) notFound();
  const t = await getDict();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/places"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t.places.title as string}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">{place.name}</h1>
            {place.name_ja && (
              <p className="mt-0.5 text-sm text-muted">{place.name_ja}</p>
            )}
            {place.address && (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                {place.address}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="chip bg-accent/15 text-accent text-[11px]">
                {place.provider_labels.length > 0
                  ? (t.places.linkedBranches as string).replace('{n}', String(place.provider_labels.length))
                  : (t.places.noBranches as string)}
              </span>
              <span className={`chip text-[11px] ${place.stock_count > 0 ? 'bg-green-500/15 text-green-400' : 'text-muted'}`}>
                {place.stock_count > 0
                  ? (t.places.stockCount as string).replace('{n}', String(place.stock_count))
                  : (t.places.noStock as string)}
              </span>
              {place.lat != null && place.lng != null ? (
                <span className="chip text-muted text-[11px]">GPS: {Math.round(place.lat * 10000) / 10000}, {Math.round(place.lng * 10000) / 10000}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {place.url && (
              <a
                href={place.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm bg-bg-elev text-muted hover:text-white inline-flex items-center gap-1.5"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {place.lat != null && place.lng != null && (
              <Link
                href={`/map?lat=${place.lat}&lng=${place.lng}&id=${place.id}`}
                className="btn btn-sm bg-bg-elev text-muted hover:text-white inline-flex items-center gap-1.5"
              >
                <Map className="h-3.5 w-3.5" aria-hidden />
                {t.places.viewOnMap as string}
              </Link>
            )}
          </div>
        </div>

        {place.provider_labels.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">{t.places.tabLinked as string}</p>
            <div className="flex flex-wrap gap-1.5">
              {place.provider_labels.map((label) => (
                <span key={label} className="chip bg-bg-elev text-[11px] text-muted">{label}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <PlaceVnBrowser placeId={place.id} placeName={place.name} />
    </main>
  );
}
