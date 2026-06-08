'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit2,
  Globe,
  Link2,
  Loader2,
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
import { AliceNetClient } from './AliceNetClient';
import { ALICENET_BRANCH_LABEL } from '@/lib/stock-provider-constants';
import { safeHref } from '@/lib/safe-href';

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
  const placeIdentityRef = useRef<number | null>(place.id);
  const deleteInFlightRef = useRef(false);
  const deleteAbortRef = useRef<AbortController | null>(null);

  const hasGps = place.lat != null && place.lng != null;
  const placeHref = safeHref(place.url);
  const isAliceNetPlace = place.provider_labels.includes(ALICENET_BRANCH_LABEL);

  useEffect(() => {
    deleteAbortRef.current?.abort();
    deleteAbortRef.current = null;
    placeIdentityRef.current = place.id;
    deleteInFlightRef.current = false;
    setShowEdit(false);
    setShowAssign(false);
    setDeleting(false);
    return () => {
      placeIdentityRef.current = null;
      deleteInFlightRef.current = false;
      deleteAbortRef.current?.abort();
      deleteAbortRef.current = null;
    };
  }, [place.id]);

  async function handleDelete() {
    if (deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    const ownerId = place.id;
    const controller = new AbortController();
    deleteAbortRef.current?.abort();
    deleteAbortRef.current = controller;
    setDeleting(true);
    try {
      const ok = await confirm({ message: t.places.deleteConfirm as string, tone: 'danger' });
      if (!ok || placeIdentityRef.current !== ownerId || deleteAbortRef.current !== controller || controller.signal.aborted) return;
      const r = await fetch(`/api/places/${place.id}`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      if (placeIdentityRef.current !== ownerId || deleteAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.places.deleteSuccess as string);
      router.push('/places');
    } catch (e) {
      if (placeIdentityRef.current === ownerId && deleteAbortRef.current === controller && !controller.signal.aborted) toast.error((e as Error).message);
    } finally {
      if (placeIdentityRef.current === ownerId && deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
        deleteInFlightRef.current = false;
        setDeleting(false);
      }
    }
  }

  function handleSaved() {
    if (placeIdentityRef.current !== place.id) return;
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
          {placeHref && (
            <a
              href={placeHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.places.urlPlaceholder as string}
              className="btn btn-sm bg-bg-elev text-muted hover:text-white"
              title={placeHref}
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
            disabled={deleting}
            className="btn btn-sm bg-bg-elev text-muted hover:text-accent"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1">{t.places.assignDialog as string}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            disabled={deleting}
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
            className="btn btn-sm text-muted hover:border-status-dropped/40 hover:text-status-dropped disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}
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

      {isAliceNetPlace ? (
        <AliceNetClient embedded basePath={`/places/${place.id}`} />
      ) : (
        <PlaceVnBrowser placeId={place.id} placeName={place.name} />
      )}

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
          onSaved={() => {
            if (placeIdentityRef.current === place.id) router.refresh();
          }}
        />
      )}
    </div>
  );
}
