'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit2,
  Globe,
  Link2,
  Map,
  MapPin,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';
import type { PlaceWithLinks } from '@/lib/db';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { AssignProviderDialog } from './AssignProviderDialog';
import { PlaceVnBrowser } from './PlaceVnBrowser';

interface Props {
  place: PlaceWithLinks;
}

function kindLabel(t: ReturnType<typeof useT>, kind: PlaceWithLinks['kind']): string {
  const key = `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return ((t.places as Record<string, unknown>)[key] as string) ?? kind;
}

export function PlaceDetailClient({ place }: Props) {
  const t = useT();
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasGps = place.lat != null && place.lng != null;

  async function handleDelete() {
    const ok = await confirm({ message: t.places.deleteConfirm as string, tone: 'danger' });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/places/${place.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      toast.success(t.places.deleteSuccess as string);
      router.push('/places');
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  function handleSaved() {
    setShowEdit(false);
    setShowAssign(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">

      {/* Back */}
      <Link
        href="/places"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t.places.title as string}
      </Link>

      {/* Place header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div>
            <h1 className="text-2xl font-black text-white">{place.name}</h1>
            {place.name_ja && (
              <p className="mt-0.5 text-sm text-muted">{place.name_ja}</p>
            )}
            {place.address && (
              <p className="mt-1 text-sm text-muted">{place.address}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-border bg-bg-elev/30 px-2 py-0.5 text-[11px] text-muted">
                {kindLabel(t, place.kind)}
              </span>
              {!hasGps && (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {t.places.noCoords as string}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.places.urlPlaceholder as string}
              className="btn btn-sm bg-bg-elev text-muted hover:text-white"
              title={place.url}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="ml-1">{t.places.urlPlaceholder as string}</span>
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
            <span className="ml-1">{t.places.deletePlace as string}</span>
          </button>
        </div>
      </div>

      {/* Notes */}
      {place.notes && (
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            <StickyNote className="h-3 w-3" aria-hidden />
            {t.places.notesPlaceholder as string}
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted">{place.notes}</p>
        </div>
      )}

      {/* VN browser */}
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
