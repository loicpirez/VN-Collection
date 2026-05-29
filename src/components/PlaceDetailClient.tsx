'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit2,
  Globe,
  Link2,
  MapPin,
  Map,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { AssignProviderDialog } from './AssignProviderDialog';
import { PlaceVnBrowser } from './PlaceVnBrowser';

const STALE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

interface Props {
  place: PlaceWithLinks;
}

function kindLabel(t: ReturnType<typeof useT>, kind: PlaceWithLinks['kind']): string {
  const key = `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return ((t.places as Record<string, unknown>)[key] as string) ?? kind;
}

function freshDays(updatedAt: number): number {
  return Math.floor((Date.now() - updatedAt) / MS_PER_DAY);
}

export function PlaceDetailClient({ place }: Props) {
  const t = useT();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const days = freshDays(place.updated_at);
  const stale = place.provider_labels.length > 0 && days >= STALE_DAYS;

  async function handleDelete() {
    if (!window.confirm(t.places.deleteConfirm as string)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/places/${place.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`${r.status}`);
      router.push('/places');
    } catch {
      setDeleting(false);
    }
  }

  function handleSaved() {
    setShowEdit(false);
    setShowAssign(false);
    router.refresh();
  }

  const hasGps = place.lat != null && place.lng != null;

  return (
    <div className="space-y-6">
      <Link
        href="/places"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white"
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
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              {place.address}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {place.url && (
            <a href={place.url} target="_blank" rel="noopener noreferrer"
              aria-label={t.places.urlPlaceholder as string}
              className="btn btn-sm bg-bg-elev text-muted hover:text-white"
              title={place.url}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="ml-1 hidden sm:inline" aria-hidden="true">{t.places.urlPlaceholder as string}</span>
            </a>
          )}
          {hasGps && (
            <Link
              href={`/map?place=${place.id}`}
              className="btn btn-sm bg-bg-elev text-muted hover:text-white"
            >
              <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="ml-1">{t.places.viewOnMap as string}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="btn btn-sm bg-bg-elev text-muted hover:text-accent"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1">{t.places.assignDialog as string}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="btn btn-sm bg-accent text-bg hover:bg-accent/80"
          >
            <Edit2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1">{t.places.editPlace as string}</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={t.places.deletePlace as string}
            className="btn btn-sm text-muted hover:border-status-dropped/40 hover:text-status-dropped"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1 hidden sm:inline" aria-hidden="true">{t.places.deletePlace as string}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`rounded-xl border p-4 text-center ${place.stock_count > 0 ? 'border-accent/30 bg-accent/5' : 'border-border bg-bg-card'}`}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
            {t.places.vnBrowserTitle as string}
          </div>
          <div className={`text-2xl font-bold ${place.stock_count > 0 ? 'text-accent' : ''}`}>
            {place.stock_count}
          </div>
        </div>

        <div className={`rounded-xl border p-4 text-center ${place.provider_labels.length > 0 ? 'border-border bg-bg-card' : 'border-dashed border-border bg-bg-card'}`}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
            {t.places.tabLinked as string}
          </div>
          <div className="text-2xl font-bold">{place.provider_labels.length}</div>
        </div>

        <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
            {t.places.kindLabel as string}
          </div>
          <div className="text-sm font-bold">{kindLabel(t, place.kind)}</div>
        </div>

        <div className={`rounded-xl border p-4 text-center ${hasGps ? 'border-border bg-bg-card' : 'border-dashed border-status-on_hold/30 bg-status-on_hold/5'}`}>
          <div className={`mb-1 text-[11px] uppercase tracking-wide ${hasGps ? 'text-muted' : 'text-status-on_hold'}`}>
            GPS
          </div>
          {hasGps ? (
            <div className="text-[11px] font-bold text-white tabular-nums">
              {Math.round(place.lat! * 10000) / 10000}, {Math.round(place.lng! * 10000) / 10000}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-status-on_hold hover:text-white underline"
            >
              <Edit2 className="h-3 w-3 shrink-0" aria-hidden />
              {t.places.editPlace as string}
            </button>
          )}
        </div>
      </div>

      {stale && (
        <div className="rounded-lg border border-status-on_hold/30 bg-status-on_hold/5 px-4 py-3 text-[12px] text-status-on_hold">
          {(t.places.freshStale as string).replace('{n}', String(days))}
        </div>
      )}

      {place.notes && (
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            <StickyNote className="h-3 w-3" aria-hidden />
            {t.places.notesPlaceholder as string}
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted">{place.notes}</p>
        </div>
      )}

      {place.provider_labels.length > 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
              {(t.places.linkedBranches as string).replace('{n}', String(place.provider_labels.length))}
            </p>
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              className="btn btn-xs bg-bg-elev text-muted hover:text-accent"
            >
              <Link2 className="h-3 w-3 shrink-0" aria-hidden />
              <span className="ml-1">{t.places.assignDialog as string}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {place.provider_labels.map((label) => (
              <span
                key={label}
                className="rounded border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-6 text-center">
          <p className="text-sm text-muted">{t.places.noBranches as string}</p>
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="btn btn-sm mt-3 bg-accent text-bg hover:bg-accent/80"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1">{t.places.assignDialog as string}</span>
          </button>
        </div>
      )}

      <PlaceVnBrowser placeId={place.id} placeName={place.name} />

      {showEdit && (
        <AddEditPlaceModal
          place={place}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
      {showAssign && (
        <AssignProviderDialog
          place={place}
          onClose={() => setShowAssign(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
