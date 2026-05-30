'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Clock, Globe, Edit2, Link2, MapPin, PackageCheck, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';
import type { PlaceWithLinks } from '@/lib/db';

const STALE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

interface Props {
  place: PlaceWithLinks;
  onEdit: (place: PlaceWithLinks) => void;
  onDelete: (place: PlaceWithLinks) => void;
  onAssign: (place: PlaceWithLinks) => void;
}

function freshnessInfo(updatedAt: number): { label: string; stale: boolean } {
  const days = Math.floor((Date.now() - updatedAt) / MS_PER_DAY);
  if (days === 0) return { label: '', stale: false };
  if (days < STALE_DAYS) return { label: '', stale: false };
  return { label: String(days), stale: true };
}

function kindLabel(t: ReturnType<typeof useT>, kind: PlaceWithLinks['kind']): string {
  const key = `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return (t.places as Record<string, unknown>)[key] as string ?? kind;
}

export function PlaceCard({ place, onEdit, onDelete, onAssign }: Props) {
  const t = useT();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const { stale, label: staleDays } = freshnessInfo(place.updated_at);
  const hasGps = place.lat != null && place.lng != null;

  async function handleDelete() {
    const ok = await confirm({ message: t.places.deleteConfirm as string, tone: 'danger' });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/places/${place.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      toast.success(t.places.deleteSuccess as string);
      onDelete(place);
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <article className="group flex flex-col rounded-xl border border-border bg-bg-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card">
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug" title={place.name}>
              {place.name}
            </h3>
            {place.name_ja && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{place.name_ja}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onAssign(place)}
              className="icon-btn tap-target text-muted hover:text-accent"
              aria-label={t.places.assignDialog as string}
              title={t.places.assignDialog as string}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onEdit(place)}
              className="icon-btn tap-target text-muted hover:text-white"
              aria-label={t.places.editPlace as string}
              title={t.places.editPlace as string}
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="icon-btn tap-target text-muted hover:text-status-dropped"
              aria-label={t.places.deletePlace as string}
              title={t.places.deletePlace as string}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {place.address && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
            <span className="line-clamp-2">{place.address}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {hasGps ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
              <MapPin className="h-3 w-3" aria-hidden />
              GPS
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
              <MapPin className="h-3 w-3" aria-hidden />
              {t.places.noCoords as string}
            </span>
          )}
          {place.stock_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
              <PackageCheck className="h-3 w-3" aria-hidden />
              {(t.places.stockCount as string).replace('{n}', String(place.stock_count))}
            </span>
          ) : (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {t.places.noStock as string}
            </span>
          )}
          {place.provider_labels.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
              <Link2 className="h-3 w-3" aria-hidden />
              {(t.places.linkedBranches as string).replace('{n}', String(place.provider_labels.length))}
            </span>
          )}
          <span className="rounded border border-border bg-bg-elev/30 px-2 py-0.5 text-[11px] text-muted">
            {kindLabel(t, place.kind)}
          </span>
          {stale && place.provider_labels.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
              <Clock className="h-3 w-3" aria-hidden />
              {(t.places.freshStale as string).replace('{n}', staleDays)}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Link
            href={`/places/${place.id}`}
            className="btn btn-xs btn-primary"
          >
            {t.places.openPlace as string}
          </Link>
          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.places.urlPlaceholder as string}
              className="inline-flex min-h-[32px] items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
              title={place.url}
            >
              <Globe className="h-3 w-3" aria-hidden />
            </a>
          )}
          {hasGps && (
            <Link
              href={`/map?place=${place.id}`}
              aria-label={t.places.viewOnMap as string}
              className="inline-flex min-h-[32px] items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              <MapPin className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
